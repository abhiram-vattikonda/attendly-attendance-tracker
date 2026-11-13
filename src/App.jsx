import { useEffect, useMemo, useState } from 'react'
import {
  cloudEnabled, supabase, loadData, generateSessionsForMonth, saveSession,
  saveSubject, saveSlot, deleteSlot, saveLocalSnapshot,
} from './lib/data.js'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const SUBJECT_COLORS = ['#477b79', '#6588a5', '#b27a58', '#8b79a7', '#638c6d', '#b36f82', '#7b8594']

const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const todayKey = () => dateKey(new Date())
const parseDate = (value) => new Date(`${value}T12:00:00`)
const monthName = (date) => date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
const longDate = (value) => parseDate(value).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const prettyTime = (value) => {
  if (!value) return ''
  const [hour, minute] = value.split(':').map(Number)
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12
  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`
}
const timeRange = (start, end) => `${prettyTime(start)} – ${prettyTime(end)}`
const uid = () => globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`

function Icon({ name, size = 18 }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M4 5.5v14A2.5 2.5 0 0 1 6.5 17H20M8 7h8M8 11h8"/></>,
    chart: <><path d="M4 19V5M4 19h17"/><rect x="7" y="12" width="3" height="5" rx=".5"/><rect x="13" y="8" width="3" height="9" rx=".5"/><rect x="19" y="4" width="2" height="13" rx=".5"/></>,
    chevronLeft: <path d="m15 18-6-6 6-6"/>,
    chevronRight: <path d="m9 18 6-6-6-6"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5"/><path d="M4 18v3h16v-3"/></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z"/><path d="m9 12 2 2 4-4"/></>,
    edit: <><path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16z"/></>,
    trash: <><path d="M3 6h18M8 6V4h8v2m3 0-1 15H6L5 6m4 4v7m6-7v7"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
    sparkle: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? null}</svg>
}

function StatCard({ label, value, sub, icon, tone = 'teal' }) {
  return (
    <div className={`stat-card ${tone}`}>
      <div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon name={icon} size={18} /></span></div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

function MonthControl({ monthDate, onChange }) {
  const shift = (amount) => onChange(new Date(monthDate.getFullYear(), monthDate.getMonth() + amount, 1))
  return (
    <div className="month-control">
      <button className="icon-button" onClick={() => shift(-1)} aria-label="Previous month"><Icon name="chevronLeft" /></button>
      <span>{monthName(monthDate)}</span>
      <button className="icon-button" onClick={() => shift(1)} aria-label="Next month"><Icon name="chevronRight" /></button>
    </div>
  )
}

function AttendanceCalendar({ monthDate, sessions, onPickDate, selectedDate }) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const count = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
  const offset = (first.getDay() + 6) % 7
  const cells = [...Array(offset).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)]
  while (cells.length % 7) cells.push(null)
  const byDay = new Map()
  sessions.forEach((session) => {
    if (!session.sessionDate.startsWith(`${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`)) return
    const day = Number(session.sessionDate.slice(-2))
    const current = byDay.get(day) ?? { present: 0, absent: 0, cancelled: 0, unmarked: 0 }
    current[session.status] = (current[session.status] ?? 0) + 1
    byDay.set(day, current)
  })
  return (
    <div className="calendar-grid">
      {WEEKDAYS_SHORT.map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}
      {cells.map((day, index) => {
        if (!day) return <div className="calendar-cell empty" key={`empty-${index}`} />
        const counts = byDay.get(day)
        const dayDate = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const hasRecords = counts && Object.values(counts).some((value) => value > 0)
        return (
          <button key={day} className={`calendar-cell ${selectedDate === dayDate ? 'selected' : ''} ${dayDate === todayKey() ? 'today' : ''}`} onClick={() => onPickDate(dayDate)}>
            <span className="calendar-number">{day}</span>
            {hasRecords ? <span className="calendar-dots">
              {counts.present > 0 && <i className="dot present" />}
              {counts.absent > 0 && <i className="dot absent" />}
              {counts.cancelled > 0 && <i className="dot cancelled" />}
              {counts.unmarked > 0 && <i className="dot unmarked" />}
            </span> : <span className="calendar-dots placeholder" />}
          </button>
        )
      })}
    </div>
  )
}

function SubjectReport({ rows }) {
  if (!rows.length) return <div className="empty-state small-empty"><div className="empty-icon"><Icon name="chart" size={22} /></div><strong>No subject data yet</strong><p>Generate this month’s classes and mark attendance to see the breakdown.</p></div>
  return (
    <div className="table-scroll">
      <table className="report-table">
        <thead><tr><th>Subject</th><th className="align-right">Held</th><th className="align-right">Present</th><th className="align-right">Absent</th><th className="align-right">Cancelled</th><th className="align-right">Pending</th><th className="percent-col">Attendance</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.subjectId}>
              <td><div className="subject-name-cell"><span className="subject-dot" style={{ background: row.color }} />{row.name}</div></td>
              <td className="align-right numeric">{row.held}</td>
              <td className="align-right numeric good-number">{row.present}</td>
              <td className="align-right numeric bad-number">{row.absent}</td>
              <td className="align-right numeric muted-number">{row.cancelled}</td>
              <td className="align-right numeric muted-number">{row.pending}</td>
              <td>
                <div className="percent-cell">
                  <div className="percent-track"><span style={{ width: `${row.percentage ?? 0}%`, background: row.color }} /></div>
                  <strong>{row.percentage === null ? '—' : `${row.percentage}%`}</strong>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Dashboard({ data, monthDate, setMonthDate, onGenerate, generating, onPickDate, selectedDate, onExport, onGoAttendance }) {
  const monthPrefix = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`
  const sessions = data.sessions.filter((item) => item.sessionDate.startsWith(monthPrefix))
  const reportRows = useMemo(() => {
    return data.subjects.filter((subject) => !subject.archived).map((subject, index) => {
      const relevant = sessions.filter((item) => item.subjectId === subject.id)
      const present = relevant.filter((item) => item.status === 'present').length
      const absent = relevant.filter((item) => item.status === 'absent').length
      const cancelled = relevant.filter((item) => item.status === 'cancelled').length
      const pending = relevant.filter((item) => item.status === 'unmarked').length
      const held = present + absent
      return { subjectId: subject.id, name: subject.name, present, absent, cancelled, pending, held, percentage: held ? Math.round((present / held) * 100) : null, color: SUBJECT_COLORS[index % SUBJECT_COLORS.length] }
    }).filter((row) => row.present + row.absent + row.cancelled + row.pending > 0)
      .sort((a, b) => (b.held - a.held) || a.name.localeCompare(b.name))
  }, [data.subjects, sessions])
  const totalPresent = sessions.filter((item) => item.status === 'present').length
  const totalAbsent = sessions.filter((item) => item.status === 'absent').length
  const totalCancelled = sessions.filter((item) => item.status === 'cancelled').length
  const totalPending = sessions.filter((item) => item.status === 'unmarked').length
  const held = totalPresent + totalAbsent
  const percentage = held ? Math.round((totalPresent / held) * 100) : 0
  const marked = totalPresent + totalAbsent + totalCancelled
  const reportableSubjects = reportRows.length
  return (
    <>
      <div className="page-heading-row">
        <div><div className="eyebrow">YOUR ATTENDANCE AT A GLANCE</div><h1>Overview</h1><p className="page-intro">Track your classes and keep an eye on your monthly attendance.</p></div>
        <div className="heading-actions"><button className="button secondary" onClick={onExport}><Icon name="download" size={16} /> Export backup</button><button className="button primary" onClick={onGenerate} disabled={generating}>{generating ? <span className="spinner" /> : <Icon name="plus" size={16} />} Create missing classes</button></div>
      </div>
      <div className="section-toolbar"><div className="section-kicker">MONTHLY SUMMARY</div><MonthControl monthDate={monthDate} onChange={setMonthDate} /></div>
      <div className="stats-grid">
        <StatCard label="Attendance percentage" value={`${percentage}%`} sub={held ? `${totalPresent} present out of ${held} held` : 'No classes marked yet'} icon="chart" tone="teal" />
        <StatCard label="Classes held" value={held} sub={`${marked} marked · ${totalPending} still unmarked`} icon="calendar" tone="blue" />
        <StatCard label="Absent" value={totalAbsent} sub="Classes marked absent" icon="clock" tone="rose" />
        <StatCard label="Cancelled" value={totalCancelled} sub="Excluded from percentage" icon="close" tone="sand" />
      </div>
      <div className="dashboard-grid">
        <section className="panel calendar-panel">
          <div className="panel-heading"><div><h2>Attendance calendar</h2><p>Select a date to mark or update classes.</p></div><span className="panel-tag">{sessions.length} scheduled</span></div>
          <AttendanceCalendar monthDate={monthDate} sessions={data.sessions} onPickDate={onPickDate} selectedDate={selectedDate} />
          <div className="calendar-legend"><span><i className="dot present" /> Present</span><span><i className="dot absent" /> Absent</span><span><i className="dot cancelled" /> Cancelled</span><span><i className="dot unmarked" /> Unmarked</span></div>
        </section>
        <section className="panel month-insight-panel">
          <div className="panel-heading"><div><h2>Month at a glance</h2><p>How your month is progressing.</p></div><span className="insight-icon"><Icon name="sparkle" /></span></div>
          <div className="big-progress"><div className="progress-ring" style={{ '--progress': `${percentage * 3.6}deg` }}><div><strong>{percentage}%</strong><span>attendance</span></div></div></div>
          <div className="insight-list">
            <div><span><i className="dot present" /> Present</span><strong>{totalPresent}</strong></div>
            <div><span><i className="dot absent" /> Absent</span><strong>{totalAbsent}</strong></div>
            <div><span><i className="dot cancelled" /> Cancelled</span><strong>{totalCancelled}</strong></div>
            <div><span><i className="dot unmarked" /> Unmarked</span><strong>{totalPending}</strong></div>
          </div>
          <button className="text-button" onClick={onGoAttendance}>Go to daily attendance <span>→</span></button>
        </section>
      </div>
      <section className="panel report-panel">
        <div className="panel-heading report-heading"><div><h2>Subject-wise attendance</h2><p>Monthly percentage calculated using Present ÷ (Present + Absent).</p></div><span className="panel-tag">{reportableSubjects} subjects</span></div>
        <SubjectReport rows={reportRows} />
        <div className="report-footnote">Cancelled and unmarked classes are not included in the attendance percentage. Each timetable period counts as one class.</div>
      </section>
    </>
  )
}

function StatusButton({ status, current, onClick, disabled }) {
  const labels = { present: 'Present', absent: 'Absent', cancelled: 'Cancelled' }
  return <button disabled={disabled} onClick={() => onClick(status)} className={`status-button ${status} ${current === status ? 'active' : ''}`}>{current === status && <Icon name="check" size={13} />}{labels[status]}</button>
}

function AttendancePage({ data, selectedDate, setSelectedDate, onGenerate, generating, onUpdateSession, onGoMonth }) {
  const daySessions = data.sessions.filter((item) => item.sessionDate === selectedDate).sort((a, b) => a.startTime.localeCompare(b.startTime))
  const markedCount = daySessions.filter((item) => item.status !== 'unmarked').length
  const present = daySessions.filter((item) => item.status === 'present').length
  const absent = daySessions.filter((item) => item.status === 'absent').length
  const cancelled = daySessions.filter((item) => item.status === 'cancelled').length
  const subjectName = (id) => data.subjects.find((subject) => subject.id === id)?.name ?? 'Choose a subject'
  const chosenDate = parseDate(selectedDate)
  const isWeekend = chosenDate.getDay() === 0
  return (
    <>
      <div className="page-heading-row">
        <div><div className="eyebrow">DAILY REGISTER</div><h1>Attendance</h1><p className="page-intro">Mark each class as present, absent, or cancelled.</p></div>
        <div className="heading-actions"><button className="button secondary" onClick={onGoMonth}>Monthly report <Icon name="chart" size={16} /></button></div>
      </div>
      <section className="panel date-panel">
        <div className="date-picker-left"><div className="date-emblem"><Icon name="calendar" size={21} /></div><div><div className="eyebrow">SELECT CLASS DATE</div><h2>{longDate(selectedDate)}</h2><p>{daySessions.length ? `${markedCount} of ${daySessions.length} classes updated` : 'No classes added for this date yet'}</p></div></div>
        <div className="date-picker-right"><label htmlFor="attendance-date">Choose date</label><input id="attendance-date" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /><button className="button primary" onClick={onGenerate} disabled={generating}>{generating ? <span className="spinner" /> : <Icon name="plus" size={16} />} Create classes</button></div>
      </section>
      {daySessions.length === 0 ? (
        <section className="panel empty-state attendance-empty"><div className="empty-icon"><Icon name="calendar" size={26} /></div><h2>No classes on this date</h2><p>{isWeekend ? 'Sunday is not part of the current timetable.' : 'Create the scheduled classes for this month. Existing attendance records will not be overwritten.'}</p><button className="button primary" onClick={onGenerate} disabled={generating}>{generating ? 'Creating…' : 'Create missing classes for this month'}</button></section>
      ) : (
        <>
          <div className="daily-stats"><div><strong>{daySessions.length}</strong><span>Scheduled</span></div><div><strong className="text-good">{present}</strong><span>Present</span></div><div><strong className="text-bad">{absent}</strong><span>Absent</span></div><div><strong>{cancelled}</strong><span>Cancelled</span></div><div><strong>{daySessions.length - markedCount}</strong><span>Unmarked</span></div></div>
          <section className="panel daily-list-panel">
            <div className="panel-heading"><div><h2>Class register</h2><p>Update the subject if a scheduled class was replaced.</p></div><span className="panel-tag">{daySessions.length} periods</span></div>
            <div className="class-list">
              {daySessions.map((session, index) => {
                const unassigned = !session.subjectId
                return (
                  <div className={`class-row ${session.status === 'cancelled' ? 'is-cancelled' : ''}`} key={session.id}>
                    <div className="class-time"><span className="class-index">{String(index + 1).padStart(2, '0')}</span><strong>{prettyTime(session.startTime)}</strong><span>{prettyTime(session.endTime)}</span></div>
                    <div className="class-subject">
                      {unassigned ? <div className="variable-label">SATURDAY · VARIABLE SUBJECT</div> : <div className="variable-label">{session.slotId?.includes('sat') ? 'CLASS' : 'SCHEDULED CLASS'}</div>}
                      <select aria-label="Class subject" value={session.subjectId ?? ''} onChange={(event) => onUpdateSession(session, { subjectId: event.target.value || null })}>
                        <option value="">{unassigned ? 'Choose Saturday subject…' : subjectName(session.subjectId)}</option>
                        {data.subjects.filter((subject) => !subject.archived).map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}
                      </select>
                      {unassigned && <small>Choose the subject taught during this Saturday session.</small>}
                    </div>
                    <div className="class-status-area">
                      <div className="status-group">
                        <StatusButton status="present" current={session.status} disabled={unassigned} onClick={(status) => onUpdateSession(session, { status })} />
                        <StatusButton status="absent" current={session.status} disabled={unassigned} onClick={(status) => onUpdateSession(session, { status })} />
                        <StatusButton status="cancelled" current={session.status} disabled={false} onClick={(status) => onUpdateSession(session, { status })} />
                      </div>
                      {session.status !== 'unmarked' && <button className="clear-status" onClick={() => onUpdateSession(session, { status: 'unmarked' })}>Clear</button>}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="daily-list-footer"><span>Cancelled sessions are not counted as held classes.</span><span>{markedCount}/{daySessions.length} updated</span></div>
          </section>
        </>
      )}
    </>
  )
}

function SlotEditor({ slot, subjects, onSave, onDelete }) {
  const [draft, setDraft] = useState(slot)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  useEffect(() => { setDraft(slot); setDirty(false) }, [slot])
  const change = (field, value) => { setDraft((current) => ({ ...current, [field]: value })); setDirty(true) }
  const handleSave = async () => {
    setSaving(true)
    try { await onSave({ ...draft, subjectId: draft.isVariable ? null : draft.subjectId }); setDirty(false) }
    finally { setSaving(false) }
  }
  return (
    <div className="timetable-row">
      <div className="slot-day"><span className={`day-pill day-${slot.dayOfWeek}`}>{WEEKDAYS[slot.dayOfWeek - 1]?.slice(0, 3)}</span><strong>{WEEKDAYS[slot.dayOfWeek - 1]}</strong></div>
      <div className="slot-time-inputs"><input type="time" value={draft.startTime} onChange={(event) => change('startTime', event.target.value)} /><span>to</span><input type="time" value={draft.endTime} onChange={(event) => change('endTime', event.target.value)} /></div>
      <div className="slot-subject-input"><select value={draft.isVariable ? '' : (draft.subjectId ?? '')} disabled={draft.isVariable} onChange={(event) => change('subjectId', event.target.value)}><option value="">Select subject</option>{subjects.filter((subject) => !subject.archived).map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select></div>
      <label className="variable-toggle"><input type="checkbox" checked={draft.isVariable} onChange={(event) => change('isVariable', event.target.checked)} /><span>Variable</span></label>
      <div className="slot-actions"><button className="icon-button save-icon" title="Save slot" disabled={!dirty || saving} onClick={handleSave}>{saving ? <span className="spinner dark" /> : <Icon name="check" size={17} />}</button><button className="icon-button danger-icon" title="Delete slot" onClick={() => onDelete(slot.id)}><Icon name="trash" size={16} /></button></div>
    </div>
  )
}

function TimetablePage({ data, onSaveSlot, onDeleteSlot, onAddSlot }) {
  const [newSlot, setNewSlot] = useState({ dayOfWeek: 1, startTime: '08:00', endTime: '09:00', subjectId: data.subjects[0]?.id ?? '', isVariable: false })
  const [adding, setAdding] = useState(false)
  const slots = [...data.slots].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime))
  const handleAdd = async (event) => {
    event.preventDefault()
    setAdding(true)
    try {
      await onAddSlot({ ...newSlot, sortOrder: slots.length })
      setNewSlot({ dayOfWeek: 1, startTime: '08:00', endTime: '09:00', subjectId: data.subjects[0]?.id ?? '', isVariable: false })
    } finally { setAdding(false) }
  }
  return (
    <>
      <div className="page-heading-row"><div><div className="eyebrow">ADMIN · SCHEDULE SETUP</div><h1>Timetable</h1><p className="page-intro">Edit the recurring weekly schedule. Past attendance records stay unchanged.</p></div><span className="panel-tag">{data.slots.length} time slots</span></div>
      <section className="panel timetable-panel">
        <div className="panel-heading"><div><h2>Weekly schedule</h2><p>Lunch from 12–1 PM is left free, as in your timetable.</p></div><span className="panel-tag">Mon – Sat</span></div>
        <div className="timetable-header"><span>DAY</span><span>TIME</span><span>SUBJECT</span><span>TYPE</span><span /></div>
        {slots.map((slot) => <SlotEditor key={slot.id} slot={slot} subjects={data.subjects} onSave={onSaveSlot} onDelete={onDeleteSlot} />)}
        <form className="add-slot-form" onSubmit={handleAdd}>
          <div className="add-slot-title"><span className="add-slot-plus"><Icon name="plus" size={17} /></span><div><strong>Add a timetable slot</strong><small>Use this for an extra class or a schedule change.</small></div></div>
          <select aria-label="Day" value={newSlot.dayOfWeek} onChange={(event) => setNewSlot((old) => ({ ...old, dayOfWeek: Number(event.target.value) }))}>{WEEKDAYS.map((day, index) => <option value={index + 1} key={day}>{day}</option>)}</select>
          <div className="new-time-inputs"><input aria-label="Start time" type="time" value={newSlot.startTime} onChange={(event) => setNewSlot((old) => ({ ...old, startTime: event.target.value }))} /><span>–</span><input aria-label="End time" type="time" value={newSlot.endTime} onChange={(event) => setNewSlot((old) => ({ ...old, endTime: event.target.value }))} /></div>
          <select aria-label="Subject" value={newSlot.subjectId} onChange={(event) => setNewSlot((old) => ({ ...old, subjectId: event.target.value }))}><option value="">Select subject</option>{data.subjects.filter((subject) => !subject.archived).map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select>
          <label className="variable-toggle"><input type="checkbox" checked={newSlot.isVariable} onChange={(event) => setNewSlot((old) => ({ ...old, isVariable: event.target.checked }))} /><span>Variable</span></label>
          <button className="button primary" type="submit" disabled={adding || (!newSlot.subjectId && !newSlot.isVariable)}>{adding ? 'Adding…' : 'Add slot'}</button>
        </form>
      </section>
      <div className="helper-note"><Icon name="shield" size={17} /><span>Changing a timetable slot affects future class generation only. Attendance already recorded for previous dates is preserved.</span></div>
    </>
  )
}

function SubjectsPage({ data, onSaveSubject }) {
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)
  const [editName, setEditName] = useState('')
  const [error, setError] = useState('')
  const add = async (event) => {
    event.preventDefault()
    const name = newName.trim()
    if (!name) return
    if (data.subjects.some((subject) => subject.name.toLowerCase() === name.toLowerCase())) { setError('That subject already exists.'); return }
    setSaving(true); setError('')
    try { await onSaveSubject({ name, archived: false }); setNewName('') }
    catch (err) { setError(err.message || 'Could not add subject.') }
    finally { setSaving(false) }
  }
  const startEdit = (subject) => { setEditing(subject.id); setEditName(subject.name) }
  const saveEdit = async (subject) => {
    const name = editName.trim()
    if (!name) return
    if (data.subjects.some((item) => item.id !== subject.id && item.name.toLowerCase() === name.toLowerCase())) { setError('A subject with that name already exists.'); return }
    setSaving(true); setError('')
    try { await onSaveSubject({ ...subject, name }); setEditing(null) }
    catch (err) { setError(err.message || 'Could not update subject.') }
    finally { setSaving(false) }
  }
  return (
    <>
      <div className="page-heading-row"><div><div className="eyebrow">ADMIN · SUBJECT SETUP</div><h1>Subjects</h1><p className="page-intro">Manage the subjects used by your timetable and monthly reports.</p></div><span className="panel-tag">{data.subjects.filter((item) => !item.archived).length} active subjects</span></div>
      <section className="panel subjects-panel">
        <div className="panel-heading"><div><h2>Your subject list</h2><p>Renaming a subject updates how it appears in reports and class selectors.</p></div></div>
        {error && <div className="inline-error">{error}</div>}
        <div className="subjects-list">
          {data.subjects.map((subject, index) => (
            <div className="subject-admin-row" key={subject.id}>
              <span className="subject-color" style={{ background: SUBJECT_COLORS[index % SUBJECT_COLORS.length] }} />
              {editing === subject.id ? <input className="subject-edit-input" value={editName} onChange={(event) => setEditName(event.target.value)} autoFocus /> : <div className="subject-admin-name"><strong>{subject.name}</strong><small>{data.slots.filter((slot) => slot.subjectId === subject.id).length} timetable slots</small></div>}
              {editing === subject.id ? <div className="edit-actions"><button className="button primary compact" onClick={() => saveEdit(subject)} disabled={saving}>Save</button><button className="button secondary compact" onClick={() => setEditing(null)}>Cancel</button></div> : <button className="icon-button" onClick={() => startEdit(subject)} title="Rename subject"><Icon name="edit" size={16} /></button>}
            </div>
          ))}
        </div>
        <form className="add-subject-form" onSubmit={add}><div><strong>Add a subject</strong><small>Add a subject here before assigning it to a timetable slot.</small></div><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="e.g. Cardiology" aria-label="New subject name" /><button className="button primary" type="submit" disabled={saving || !newName.trim()}><Icon name="plus" size={16} /> Add subject</button></form>
      </section>
      <div className="helper-note"><Icon name="shield" size={17} /><span>Subjects are not permanently deleted, so historical attendance summaries remain intact.</span></div>
    </>
  )
}

function LoginScreen({ onLogin, loading, error }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand-mark large">A<span>.</span></div>
        <div className="eyebrow">PRIVATE ATTENDANCE WORKSPACE</div>
        <h1>Welcome back</h1><p>Sign in with your admin account to manage attendance.</p>
        <form onSubmit={(event) => { event.preventDefault(); onLogin(email, password) }}>
          <label>Email address</label><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="username" required />
          <label>Password</label><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" autoComplete="current-password" required />
          {error && <div className="inline-error">{error}</div>}
          <button className="button primary auth-submit" type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'} <span>→</span></button>
        </form>
        <div className="auth-foot"><Icon name="shield" size={15} /> Admin access is controlled by your Supabase project.</div>
      </div>
    </div>
  )
}

function App() {
  const [data, setData] = useState(null)
  const [activePage, setActivePage] = useState('overview')
  const [monthDate, setMonthDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(todayKey())
  const [loadingData, setLoadingData] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [user, setUser] = useState(null)
  const [adminAccess, setAdminAccess] = useState(!cloudEnabled)
  const [authChecking, setAuthChecking] = useState(cloudEnabled)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [profileMessage, setProfileMessage] = useState('')

  const refreshData = async () => {
    setLoadingData(true)
    setError('')
    try { setData(await loadData()) }
    catch (err) { setError(err.message || 'Could not load attendance data.') }
    finally { setLoadingData(false) }
  }

  useEffect(() => {
    if (!cloudEnabled) {
      refreshData()
      return undefined
    }
    let mounted = true
    const checkUser = async (currentUser) => {
      if (!mounted) return
      setUser(currentUser)
      if (!currentUser) {
        setAdminAccess(false); setData(null); setProfileMessage(''); setLoadingData(false); setAuthChecking(false)
        return
      }
      setAuthChecking(true)
      try {
        const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', currentUser.id).maybeSingle()
        if (profileError) throw profileError
        if (!profile || profile.role !== 'admin') {
          setAdminAccess(false); setData(null)
          setProfileMessage(profile ? 'Your account exists, but it has not been granted admin access yet.' : 'Your profile has not been created. Check the Supabase setup instructions.')
        } else {
          setAdminAccess(true); setProfileMessage('')
          const fresh = await loadData()
          if (mounted) setData(fresh)
        }
      } catch (err) {
        setAdminAccess(false); setData(null); setProfileMessage(err.message || 'Could not verify your admin access.')
      } finally {
        if (mounted) { setAuthChecking(false); setLoadingData(false) }
      }
    }
    supabase.auth.getSession().then(({ data: sessionData }) => checkUser(sessionData.session?.user ?? null))
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      checkUser(session?.user ?? null)
    })
    return () => { mounted = false; authListener.subscription.unsubscribe() }
  }, [])

  const handleLogin = async (email, password) => {
    setLoginLoading(true); setLoginError('')
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) setLoginError(signInError.message)
    setLoginLoading(false)
  }

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut()
    setUser(null); setData(null); setAdminAccess(false)
  }

  const handleGenerate = async (target = monthDate) => {
    if (!data) return
    const targetMonth = typeof target === 'string' ? parseDate(target) : target
    setGenerating(true); setError('')
    try {
      const nextSessions = await generateSessionsForMonth(targetMonth.getFullYear(), targetMonth.getMonth(), data.slots, data.sessions)
      setData((current) => ({ ...current, sessions: nextSessions }))
    } catch (err) { setError(err.message || 'Could not create classes. Please check your connection.') }
    finally { setGenerating(false) }
  }

  const handleUpdateSession = async (session, changes) => {
    const next = { ...session, ...changes }
    setError('')
    try {
      await saveSession(next)
      setData((current) => {
        const updated = { ...current, sessions: current.sessions.map((item) => item.id === next.id ? next : item) }
        saveLocalSnapshot(updated)
        return updated
      })
    } catch (err) { setError(err.message || 'Could not save this attendance update.') }
  }

  const handleSaveSubject = async (subject) => {
    const saved = await saveSubject(subject)
    setData((current) => {
      const subjects = subject.id ? current.subjects.map((item) => item.id === saved.id ? saved : item) : [...current.subjects, saved]
      const updated = { ...current, subjects }
      saveLocalSnapshot(updated)
      return updated
    })
  }

  const handleSaveSlot = async (slot) => {
    const saved = await saveSlot(slot)
    setData((current) => {
      const slots = slot.id ? current.slots.map((item) => item.id === saved.id ? saved : item) : [...current.slots, saved]
      const updated = { ...current, slots }
      saveLocalSnapshot(updated)
      return updated
    })
  }

  const handleDeleteSlot = async (slotId) => {
    if (!window.confirm('Delete this timetable slot? Existing attendance records will be kept.')) return
    try {
      await deleteSlot(slotId)
      setData((current) => {
        const updated = { ...current, slots: current.slots.filter((item) => item.id !== slotId) }
        saveLocalSnapshot(updated)
        return updated
      })
    } catch (err) { setError(err.message || 'Could not delete this timetable slot.') }
  }

  const handleExport = () => {
    if (!data) return
    const payload = { exportedAt: new Date().toISOString(), app: 'Attendly', version: 1, ...data }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `attendly-backup-${todayKey()}.json`; link.click()
    URL.revokeObjectURL(url)
  }

  const navigate = (page) => { setActivePage(page); setMobileNavOpen(false) }
  const navItems = [
    { id: 'overview', label: 'Overview', icon: 'grid', group: 'TRACK' },
    { id: 'attendance', label: 'Daily attendance', icon: 'calendar', group: 'TRACK' },
    { id: 'timetable', label: 'Timetable', icon: 'clock', group: 'ADMIN' },
    { id: 'subjects', label: 'Subjects', icon: 'book', group: 'ADMIN' },
  ]

  if (cloudEnabled && authChecking) return <div className="loading-screen"><div className="brand-mark">A<span>.</span></div><span className="spinner large-spinner" /><p>Checking your workspace…</p></div>
  if (cloudEnabled && !user) return <LoginScreen onLogin={handleLogin} loading={loginLoading} error={loginError} />
  if (cloudEnabled && user && !adminAccess) return (
    <div className="auth-screen"><div className="auth-card access-card"><div className="brand-mark large">A<span>.</span></div><div className="eyebrow">ADMIN ACCESS REQUIRED</div><h1>Almost there</h1><p>{profileMessage || 'This account does not have permission to access the attendance workspace.'}</p><div className="setup-hint">Open your Supabase SQL Editor and promote your user profile to <code>admin</code>. The README contains the exact SQL command.</div><button className="button secondary auth-submit" onClick={handleLogout}><Icon name="logout" size={16} /> Sign out</button></div></div>
  )
  if (loadingData || !data) return <div className="loading-screen"><div className="brand-mark">A<span>.</span></div><span className="spinner large-spinner" /><p>Loading your attendance workspace…</p></div>

  const pageTitle = navItems.find((item) => item.id === activePage)?.label ?? 'Overview'
  return (
    <div className="app-shell">
      {mobileNavOpen && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`sidebar ${mobileNavOpen ? 'open' : ''}`}>
        <div className="brand"><div className="brand-mark">A<span>.</span></div><div><strong>attendly</strong><small>STUDENT WORKSPACE</small></div></div>
        <div className="sidebar-profile"><div className="avatar">{cloudEnabled ? (user?.email?.[0]?.toUpperCase() ?? 'A') : 'A'}</div><div><strong>{cloudEnabled ? 'Admin workspace' : 'My workspace'}</strong><small>{cloudEnabled ? user?.email : 'Personal attendance'}</small></div></div>
        <div className="nav-label">WORKSPACE</div>
        {['TRACK', 'ADMIN'].map((group) => <div className="nav-group" key={group}><div className="nav-group-label">{group}</div>{navItems.filter((item) => item.group === group).map((item) => <button key={item.id} className={`nav-item ${activePage === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)}><Icon name={item.icon} size={18} /><span>{item.label}</span>{activePage === item.id && <i />}</button>)}</div>)}
        <div className="sidebar-bottom"><div className={`sync-status ${cloudEnabled ? 'cloud' : 'local'}`}><span className="sync-dot" /><div><strong>{cloudEnabled ? 'Cloud sync enabled' : 'Local mode'}</strong><small>{cloudEnabled ? 'Synced to your database' : 'Saved in this browser only'}</small></div></div><button className="sidebar-export" onClick={handleExport}><Icon name="download" size={16} /> Export data backup</button>{cloudEnabled && <button className="sidebar-export logout-button" onClick={handleLogout}><Icon name="logout" size={16} /> Sign out</button>}<div className="sidebar-version">ATTENDLY · VERSION 1.0</div></div>
      </aside>
      <main className="main-area">
        <header className="topbar"><div className="topbar-left"><button className="mobile-menu-button" onClick={() => setMobileNavOpen(true)} aria-label="Open menu"><Icon name="menu" /></button><span className="topbar-breadcrumb">Workspace <b>/</b> {pageTitle}</span></div><div className="topbar-right"><span className={`mode-pill ${cloudEnabled ? 'cloud' : 'local'}`}><i />{cloudEnabled ? 'Cloud synced' : 'Local storage'}</span><div className="top-avatar">{cloudEnabled ? (user?.email?.[0]?.toUpperCase() ?? 'A') : 'A'}</div></div></header>
        <div className="page-content">
          {error && <div className="global-error"><span>{error}</span><button onClick={() => setError('')}><Icon name="close" size={15} /></button></div>}
          {activePage === 'overview' && <Dashboard data={data} monthDate={monthDate} setMonthDate={setMonthDate} onGenerate={handleGenerate} generating={generating} onPickDate={(date) => { setSelectedDate(date); navigate('attendance') }} selectedDate={selectedDate} onExport={handleExport} onGoAttendance={() => navigate('attendance')} />}
          {activePage === 'attendance' && <AttendancePage data={data} selectedDate={selectedDate} setSelectedDate={setSelectedDate} onGenerate={() => handleGenerate(selectedDate)} generating={generating} onUpdateSession={handleUpdateSession} onGoMonth={() => navigate('overview')} />}
          {activePage === 'timetable' && <TimetablePage data={data} onSaveSlot={handleSaveSlot} onDeleteSlot={handleDeleteSlot} onAddSlot={handleSaveSlot} />}
          {activePage === 'subjects' && <SubjectsPage data={data} onSaveSubject={handleSaveSubject} />}
          <footer className="page-footer"><span>Attendly</span><span>Made to keep your attendance on track.</span></footer>
        </div>
      </main>
    </div>
  )
}

export default App
