import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null
export const cloudEnabled = Boolean(supabase)

const LOCAL_KEY = 'attendly-medical-tracker-v1'
const uid = () => globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`

const initialSubjects = [
  'Orthopedics', 'Clinical Postings', 'Gen. Medicine', 'OBGY', 'Pediatrics',
  'General Surgery', 'Ophthalmology', 'Anesthesia', 'ENT', 'Dermatology',
  'Psychiatry', 'Radiology', 'ECCA', 'Yoga A / Sports B', 'Yoga C / Sports D',
  'Yoga B / Sports A', 'Yoga D / Sports C',
]

const subjectIds = Object.fromEntries(initialSubjects.map((name) => [name, `subject-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`]))
const slotSeed = [
  [1, '08:00', '09:00', 'Orthopedics'],
  [1, '09:00', '12:00', 'Clinical Postings'],
  [1, '13:00', '14:00', 'Gen. Medicine'],
  [1, '14:00', '15:00', 'OBGY'],
  [1, '15:00', '16:00', 'OBGY'],
  [1, '16:00', '17:00', 'Yoga A / Sports B'],
  [2, '08:00', '09:00', 'Pediatrics'],
  [2, '09:00', '12:00', 'Clinical Postings'],
  [2, '13:00', '14:00', 'Gen. Medicine'],
  [2, '14:00', '15:00', 'General Surgery'],
  [2, '15:00', '16:00', 'General Surgery'],
  [2, '16:00', '17:00', 'Yoga C / Sports D'],
  [3, '08:00', '09:00', 'General Surgery'],
  [3, '09:00', '12:00', 'Clinical Postings'],
  [3, '13:00', '14:00', 'Ophthalmology'],
  [3, '14:00', '15:00', 'Gen. Medicine'],
  [3, '15:00', '16:00', 'Gen. Medicine'],
  [3, '16:00', '17:00', 'Yoga B / Sports A'],
  [4, '08:00', '09:00', 'Anesthesia'],
  [4, '09:00', '12:00', 'Clinical Postings'],
  [4, '13:00', '14:00', 'General Surgery'],
  [4, '14:00', '15:00', 'Orthopedics'],
  [4, '15:00', '16:00', 'OBGY'],
  [4, '16:00', '17:00', 'Yoga D / Sports C'],
  [5, '08:00', '09:00', 'OBGY'],
  [5, '09:00', '12:00', 'Clinical Postings'],
  [5, '13:00', '14:00', 'ENT'],
  [5, '14:00', '15:00', 'Dermatology'],
  [5, '15:00', '16:00', 'General Surgery'],
  [5, '16:00', '17:00', 'ECCA'],
  [6, '08:00', '09:00', 'Gen. Medicine'],
  [6, '09:00', '12:00', null],
  [6, '13:00', '14:00', 'Psychiatry'],
  [6, '14:00', '15:00', 'Pediatrics'],
  [6, '15:00', '16:00', 'Radiology'],
  [6, '16:00', '17:00', 'ECCA'],
]

function makeLocalSeed() {
  const subjects = initialSubjects.map((name) => ({
    id: subjectIds[name], name, archived: false,
  }))
  const slots = slotSeed.map(([dayOfWeek, startTime, endTime, name], index) => ({
    id: `slot-${dayOfWeek}-${startTime.replace(':', '')}`,
    dayOfWeek, startTime, endTime,
    subjectId: name ? subjectIds[name] : null,
    isVariable: !name,
    sortOrder: index,
  }))
  return { subjects, slots, sessions: [] }
}

function persistLocal(data) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(data))
}

function normaliseSession(row) {
  return {
    id: row.id,
    sessionDate: row.session_date,
    slotId: row.slot_id,
    subjectId: row.subject_id,
    startTime: row.start_time?.slice(0, 5),
    endTime: row.end_time?.slice(0, 5),
    status: row.status ?? 'unmarked',
    note: row.note ?? '',
  }
}

function normaliseSlot(row) {
  return {
    id: row.id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time?.slice(0, 5),
    endTime: row.end_time?.slice(0, 5),
    subjectId: row.subject_id,
    isVariable: row.is_variable,
    sortOrder: row.sort_order ?? 0,
  }
}

async function fetchCloudData() {
  const [subjectResult, slotResult, sessionResult] = await Promise.all([
    supabase.from('subjects').select('*').order('name'),
    supabase.from('timetable_slots').select('*').order('day_of_week').order('start_time'),
    supabase.from('class_sessions').select('*').order('session_date').range(0, 9999),
  ])
  for (const result of [subjectResult, slotResult, sessionResult]) {
    if (result.error) throw result.error
  }
  return {
    subjects: (subjectResult.data ?? []).map((row) => ({ id: row.id, name: row.name, archived: row.archived ?? false })),
    slots: (slotResult.data ?? []).map(normaliseSlot),
    sessions: (sessionResult.data ?? []).map(normaliseSession),
  }
}

export async function loadData() {
  if (!supabase) {
    let saved = localStorage.getItem(LOCAL_KEY)
    if (!saved) {
      const seeded = makeLocalSeed()
      persistLocal(seeded)
      return seeded
    }
    try {
      const parsed = JSON.parse(saved)
      const seed = makeLocalSeed()
      return {
        subjects: Array.isArray(parsed.subjects) ? parsed.subjects : seed.subjects,
        slots: Array.isArray(parsed.slots) ? parsed.slots : seed.slots,
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      }
    } catch {
      const seeded = makeLocalSeed()
      persistLocal(seeded)
      return seeded
    }
  }

  let data = await fetchCloudData()
  if (data.subjects.length === 0) {
    const { error } = await supabase.rpc('seed_attendly_data')
    if (error) throw error
    data = await fetchCloudData()
  }
  return data
}

function dateToDay(dateString) {
  // Convert JS Sunday=0 to the timetable's Monday=1 ... Saturday=6 convention.
  return new Date(`${dateString}T12:00:00`).getDay() || 7
}

export async function generateSessionsForMonth(year, monthIndex, slots, existingSessions) {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const existingKeys = new Set(existingSessions.map((item) => `${item.sessionDate}|${item.slotId}`))
  const pending = []
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const weekday = dateToDay(date)
    for (const slot of slots.filter((item) => item.dayOfWeek === weekday)) {
      const key = `${date}|${slot.id}`
      if (existingKeys.has(key)) continue
      pending.push({
        id: uid(), sessionDate: date, slotId: slot.id,
        subjectId: slot.isVariable ? null : slot.subjectId,
        startTime: slot.startTime, endTime: slot.endTime,
        status: 'unmarked', note: '',
      })
    }
  }
  if (pending.length === 0) return existingSessions

  if (supabase) {
    const { data: authData } = await supabase.auth.getUser()
    const userId = authData?.user?.id
    const rows = pending.map((item) => ({
      id: item.id,
      user_id: userId,
      session_date: item.sessionDate,
      slot_id: item.slotId,
      subject_id: item.subjectId,
      start_time: item.startTime,
      end_time: item.endTime,
      status: item.status,
      note: item.note,
    }))
    const { error } = await supabase.from('class_sessions').upsert(rows, {
      onConflict: 'user_id,session_date,slot_id', ignoreDuplicates: true,
    })
    if (error) throw error
    const { data, error: fetchError } = await supabase.from('class_sessions').select('*').order('session_date').range(0, 9999)
    if (fetchError) throw fetchError
    return (data ?? []).map(normaliseSession)
  }

  const next = [...existingSessions, ...pending]
  const all = { ...loadLocalState(), sessions: next }
  persistLocal(all)
  return next
}

function loadLocalState() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) ?? makeLocalSeed() }
  catch { return makeLocalSeed() }
}

export async function saveSession(session) {
  if (supabase) {
    const { error } = await supabase.from('class_sessions').update({
      subject_id: session.subjectId,
      status: session.status,
      note: session.note,
    }).eq('id', session.id)
    if (error) throw error
  } else {
    const data = loadLocalState()
    data.sessions = data.sessions.map((item) => item.id === session.id ? session : item)
    persistLocal(data)
  }
  return session
}

export async function saveSubject(subject) {
  if (supabase) {
    const query = subject.id
      ? supabase.from('subjects').update({ name: subject.name, archived: subject.archived ?? false }).eq('id', subject.id).select().single()
      : supabase.from('subjects').insert({ name: subject.name, archived: false }).select().single()
    const { data, error } = await query
    if (error) throw error
    return { id: data.id, name: data.name, archived: data.archived ?? false }
  }
  const data = loadLocalState()
  const saved = subject.id ? subject : { ...subject, id: uid(), archived: false }
  data.subjects = subject.id
    ? data.subjects.map((item) => item.id === subject.id ? saved : item)
    : [...data.subjects, saved]
  persistLocal(data)
  return saved
}

export async function saveSlot(slot) {
  if (supabase) {
    const values = {
      day_of_week: slot.dayOfWeek,
      start_time: slot.startTime,
      end_time: slot.endTime,
      subject_id: slot.isVariable ? null : slot.subjectId,
      is_variable: slot.isVariable,
      sort_order: slot.sortOrder ?? 0,
    }
    const query = slot.id
      ? supabase.from('timetable_slots').update(values).eq('id', slot.id).select().single()
      : supabase.from('timetable_slots').insert(values).select().single()
    const { data, error } = await query
    if (error) throw error
    return normaliseSlot(data)
  }
  const data = loadLocalState()
  const saved = slot.id ? slot : { ...slot, id: uid() }
  data.slots = slot.id
    ? data.slots.map((item) => item.id === slot.id ? saved : item)
    : [...data.slots, saved]
  persistLocal(data)
  return saved
}

export async function deleteSlot(slotId) {
  if (supabase) {
    const { error } = await supabase.from('timetable_slots').delete().eq('id', slotId)
    if (error) throw error
  } else {
    const data = loadLocalState()
    data.slots = data.slots.filter((item) => item.id !== slotId)
    // Historical attendance is retained; the slot ID is just a reference label in each record.
    persistLocal(data)
  }
}

export function saveLocalSnapshot(data) {
  if (!supabase) persistLocal(data)
}
