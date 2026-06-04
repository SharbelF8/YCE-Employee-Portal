
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import "./styles.css";
import logo from "./logo.png";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

function money(n) {
  return Number(n || 0).toFixed(2);
}
function initials(name) {
  return String(name || "")
    .split(" ")
    .filter(Boolean)
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
function normalize(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}
function phoneFormat(v) {
  const d = String(v || "").replace(/\D/g, "").slice(0, 10);
  if (d.length > 6) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length > 3) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return d;
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function nowHM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function calcHours(start, end) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 1440;
  return Math.max(0, mins / 60);
}

function App() {
  const [user, setUser] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [hours, setHours] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [loginName, setLoginName] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [page, setPage] = useState("home");
  const [adminPage, setAdminPage] = useState("dash");
  const [toast, setToast] = useState("");
  const [clocked, setClocked] = useState(null);
  const [clockNow, setClockNow] = useState(nowHM());
  const [availMonth, setAvailMonth] = useState(new Date());
  const [selectedDates, setSelectedDates] = useState(new Set());
  const [availNotes, setAvailNotes] = useState("");
  const [adminAvailEmp, setAdminAvailEmp] = useState(null);
  const [adminAvailMonth, setAdminAvailMonth] = useState(new Date());
  const [earnMonth, setEarnMonth] = useState(new Date().getMonth() + 1);
  const [earnYear, setEarnYear] = useState(new Date().getFullYear());
  const [editEmp, setEditEmp] = useState(null);
  const [empForm, setEmpForm] = useState({ full_name: "", role: "", hourly_rate: "", email: "", phone: "", password: "" });
  const [profileEdit, setProfileEdit] = useState(false);
  const [profileForm, setProfileForm] = useState({ full_name: "", role: "", email: "", phone: "", password: "" });

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 1800);
  }

  async function loadAll() {
    const [e, h, a] = await Promise.all([
      supabase.from("employees").select("*").eq("active", true).order("created_at", { ascending: true }),
      supabase.from("hours").select("*, employees(hourly_rate)").order("created_at", { ascending: false }),
      supabase.from("availability").select("*").order("available_date", { ascending: true }),
    ]);
    if (!e.error) setEmployees(e.data || []);
    if (!h.error) setHours(h.data || []);
    if (!a.error) setAvailability(a.data || []);
  }

  useEffect(() => {
    loadAll();
    const channel = supabase
      .channel("yce-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "hours" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "availability" }, loadAll)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setClockNow(nowHM()), 1000);
    return () => clearInterval(t);
  }, []);

  const activeEmployees = employees.filter((e) => !e.is_admin);
  const userHours = user ? hours.filter((h) => h.employee_id === user.id) : [];
  const userAvailability = user ? availability.filter((a) => a.employee_id === user.id) : [];

  async function login() {
    const employee = employees.find((e) => normalize(e.full_name) === normalize(loginName));
    if (!employee || employee.password !== loginPw) {
      showToast("Wrong name or password");
      return;
    }
    setUser(employee);
    setLoginName("");
    setLoginPw("");
    if (employee.is_admin) {
      setAdminPage("dash");
    } else {
      setPage("home");
    }
  }

  function logout() {
    setUser(null);
    setClocked(null);
    setPage("home");
    setAdminPage("dash");
  }

  async function submitManualHours(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const date = `${fd.get("year")}-${String(fd.get("month")).padStart(2, "0")}-${String(fd.get("day")).padStart(2, "0")}`;
    const start = `${fd.get("startHour")}:${fd.get("startMinute")}`;
    const end = `${fd.get("endHour")}:${fd.get("endMinute")}`;
    const { error } = await supabase.from("hours").insert({
      employee_id: user.id,
      date,
      start_time: start,
      end_time: end,
      total_hours: calcHours(start, end),
      notes: fd.get("notes") || "",
      status: "pending",
    });
    if (error) showToast(error.message);
    else {
      showToast("Hours sent to admin");
      setPage("log");
      e.currentTarget.reset();
      loadAll();
    }
  }

  async function toggleClock() {
    if (!clocked) {
      setClocked({ date: todayISO(), start: nowHM() });
      showToast("Clocked in");
      return;
    }
    const end = nowHM();
    const { error } = await supabase.from("hours").insert({
      employee_id: user.id,
      date: clocked.date,
      start_time: clocked.start,
      end_time: end,
      total_hours: calcHours(clocked.start, end),
      notes: "Submitted from clock in/out",
      status: "pending",
    });
    if (error) showToast(error.message);
    else {
      setClocked(null);
      showToast("Clocked out — hours submitted");
      setPage("log");
      loadAll();
    }
  }

  function dateKey(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function loadAvailForUser() {
    const set = new Set(userAvailability.map((a) => a.available_date));
    setSelectedDates(set);
    setAvailNotes(userAvailability.find((a) => a.notes)?.notes || "");
  }

  useEffect(() => {
    if (page === "availability" && user) loadAvailForUser();
  }, [page, availability, user?.id]);

  async function saveAvailability() {
    const currentRows = availability.filter((a) => a.employee_id === user.id);
    const existing = new Set(currentRows.map((a) => a.available_date));
    const desired = selectedDates;
    const toDelete = currentRows.filter((a) => !desired.has(a.available_date)).map((a) => a.id);
    const toInsert = [...desired].filter((d) => !existing.has(d)).map((available_date) => ({
      employee_id: user.id,
      available_date,
      notes: availNotes || "",
    }));
    if (toDelete.length) await supabase.from("availability").delete().in("id", toDelete);
    if (toInsert.length) await supabase.from("availability").insert(toInsert);
    if ([...desired].length) {
      await supabase.from("availability").update({ notes: availNotes || "" }).eq("employee_id", user.id).in("available_date", [...desired]);
    }
    showToast("Availability saved");
    loadAll();
  }

  async function setStatus(id, status) {
    const { data, error } = await supabase
      .from("hours")
      .update({ status })
      .eq("id", id)
      .select();

    if (error) {
      showToast(error.message);
      return;
    }

    if (!data || data.length === 0) {
      showToast("No row updated. Check Supabase policies.");
      return;
    }

    showToast(status === "approved" ? "Approved" : "Denied");
    await loadAll();
  }

  function statusText(s) {
    if (s === "approved") return "Approved";
    if (s === "rejected") return "Denied";
    return "Pending";
  }

  function shiftPay(h) {
    const emp = employees.find((e) => e.id === h.employee_id);
    return Number(h.total_hours || 0) * Number(emp?.hourly_rate || 0);
  }

  async function saveEmployee() {
    if (!empForm.full_name.trim()) return showToast("Employee name required");
    const payload = {
      full_name: empForm.full_name.trim(),
      role: empForm.role || "",
      email: empForm.email || "",
      phone: phoneFormat(empForm.phone || ""),
      hourly_rate: Number(empForm.hourly_rate || 0),
      password: empForm.password || "1234",
      is_admin: false,
      active: true,
    };
    if (editEmp) {
      await supabase.from("employees").update(payload).eq("id", editEmp.id);
      showToast("Employee updated");
    } else {
      await supabase.from("employees").insert(payload);
      showToast("Employee added");
    }
    setEditEmp(null);
    setEmpForm({ full_name: "", role: "", hourly_rate: "", email: "", phone: "", password: "" });
    loadAll();
  }

  function startEditEmployee(emp) {
    setEditEmp(emp);
    setEmpForm({
      full_name: emp.full_name || "",
      role: emp.role || "",
      hourly_rate: emp.hourly_rate || "",
      email: emp.email || "",
      phone: emp.phone || "",
      password: emp.password || "",
    });
  }

  async function removeEmployee() {
    if (!editEmp) return;
    if (!confirm("Are you sure you want to remove this employee from the system? They will no longer be able to log in.")) return;
    await supabase.from("employees").update({ active: false }).eq("id", editEmp.id);
    setEditEmp(null);
    setEmpForm({ full_name: "", role: "", hourly_rate: "", email: "", phone: "", password: "" });
    showToast("Employee removed");
    loadAll();
  }

  function startProfileEdit() {
    setProfileEdit(true);
    setProfileForm({
      full_name: user.full_name,
      role: user.role,
      email: user.email,
      phone: user.phone,
      password: "",
    });
  }

  async function saveProfile() {
    const payload = {
      full_name: profileForm.full_name || user.full_name,
      role: user.role,
      email: profileForm.email || "",
      phone: phoneFormat(profileForm.phone || ""),
    };
    if (profileForm.password) payload.password = profileForm.password;
    const { data, error } = await supabase.from("employees").update(payload).eq("id", user.id).select().single();
    if (error) showToast(error.message);
    else {
      setUser(data);
      setProfileEdit(false);
      showToast("Profile updated");
      loadAll();
    }
  }

  function exportCsv() {
    const approved = hours.filter((h) => h.status === "approved");
    const rows = [["Employee", "Date", "Start", "End", "Total Hours", "Hourly Rate", "Shift Pay", "Status", "Notes"]];
    approved.forEach((h) => {
      const emp = employees.find((e) => e.id === h.employee_id);
      rows.push([
        emp?.full_name || "",
        h.date,
        h.start_time,
        h.end_time,
        money(h.total_hours),
        money(emp?.hourly_rate),
        money(shiftPay(h)),
        h.status,
        h.notes || "",
      ]);
    });
    const csv = rows.map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "YCE-approved-hours.csv";
    a.click();
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return <div className="appframe"><div className="login"><img className="logo" src={logo}/><div className="card"><h2>Missing Supabase Setup</h2><p className="small-text">Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.</p></div></div></div>;
  }

  if (!user) {
    return (
      <div className="appframe">
        {toast && <div id="toast" style={{ display: "block" }}>{toast}</div>}
        <section className="login">
          <img className="logo" src={logo} alt="YCE" />
          <h1>Employee Portal</h1>
          <div className="card">
            <h2>Sign in</h2>
            <label>Full Name</label>
            <input value={loginName} onChange={(e) => setLoginName(e.target.value)} placeholder="Ex. Bassam Francis" />
            <label>Password</label>
            <input value={loginPw} onChange={(e) => setLoginPw(e.target.value)} type="password" placeholder="Password" />
            <button className="gold-btn" onClick={login}>Sign In</button>
          </div>
        </section>
      </div>
    );
  }

  if (user.is_admin) {
    return (
      <AdminPortal
        toast={toast}
        user={user}
        logout={logout}
        page={adminPage}
        setPage={setAdminPage}
        employees={activeEmployees}
        allEmployees={employees}
        hours={hours}
        availability={availability}
        setStatus={setStatus}
        exportCsv={exportCsv}
        shiftPay={shiftPay}
        editEmp={editEmp}
        empForm={empForm}
        setEmpForm={setEmpForm}
        startEditEmployee={startEditEmployee}
        saveEmployee={saveEmployee}
        removeEmployee={removeEmployee}
        setEditEmp={setEditEmp}
        earnMonth={earnMonth}
        setEarnMonth={setEarnMonth}
        earnYear={earnYear}
        setEarnYear={setEarnYear}
        adminAvailEmp={adminAvailEmp}
        setAdminAvailEmp={setAdminAvailEmp}
        adminAvailMonth={adminAvailMonth}
        setAdminAvailMonth={setAdminAvailMonth}
      />
    );
  }

  return (
    <EmployeePortal
      toast={toast}
      user={user}
      page={page}
      setPage={setPage}
      logout={logout}
      userHours={userHours}
      hours={hours}
      submitManualHours={submitManualHours}
      clockNow={clockNow}
      clocked={clocked}
      toggleClock={toggleClock}
      availMonth={availMonth}
      setAvailMonth={setAvailMonth}
      selectedDates={selectedDates}
      setSelectedDates={setSelectedDates}
      dateKey={dateKey}
      availNotes={availNotes}
      setAvailNotes={setAvailNotes}
      saveAvailability={saveAvailability}
      profileEdit={profileEdit}
      startProfileEdit={startProfileEdit}
      setProfileEdit={setProfileEdit}
      profileForm={profileForm}
      setProfileForm={setProfileForm}
      saveProfile={saveProfile}
    />
  );
}

function EmployeePortal(props) {
  const { toast, user, page, setPage, logout, userHours, submitManualHours, clockNow, clocked, toggleClock, availMonth, setAvailMonth, selectedDates, setSelectedDates, dateKey, availNotes, setAvailNotes, saveAvailability, profileEdit, startProfileEdit, setProfileEdit, profileForm, setProfileForm, saveProfile } = props;
  const approved = userHours.filter((h) => h.status === "approved").reduce((a, h) => a + Number(h.total_hours || 0), 0);
  const total = userHours.reduce((a, h) => a + Number(h.total_hours || 0), 0);

  return (
    <div className="appframe">
      {toast && <div id="toast" style={{ display: "block" }}>{toast}</div>}
      <header className="header">
        <div><small>YCE EMPLOYEE PORTAL</small><h2>{page === "log" ? "Log" : page[0].toUpperCase() + page.slice(1)}</h2></div>
        <img className="logo" src={logo} />
      </header>
      <main>
        {page === "home" && <section className="page active">
          <div className="profile-pill">
            <div className="initials">{initials(user.full_name)}</div>
            <div><div className="small-text">Good morning,</div><div className="emp-name">{user.full_name}</div><div className="role-text">YCE Employee</div></div>
          </div>
          <div className="stats">
            <div className="stat"><b>{money(total)}</b><span>This Week Hours</span></div>
            <div className="stat"><b>{money(approved)}</b><span>Approved Hours</span></div>
          </div>
          <div className="card"><h3>Recent Activity</h3><HourList hours={userHours.slice(0,3)} /></div>
        </section>}
        {page === "hours" && <section className="page active">
          <div className="card">
            <img className="logo form-logo" src={logo} />
            <h3>Hours</h3>
            <div className="clock-panel">
              <div className="clock-time">{clockNow}</div>
              <div className="clock-state">{clocked ? `Clocked in at ${clocked.start}` : "Ready to clock in"}</div>
              <button className="gold-btn" onClick={toggleClock}>{clocked ? "Clock Out" : "Clock In"}</button>
            </div>
            <h3>Manual Submit</h3>
            <HoursForm onSubmit={submitManualHours} />
          </div>
        </section>}
        {page === "availability" && <section className="page active">
          <div className="card">
            <img className="logo form-logo" src={logo} />
            <h3>Availability</h3>
            <Calendar month={availMonth} setMonth={setAvailMonth} selectedDates={selectedDates} setSelectedDates={setSelectedDates} dateKey={dateKey} clickable />
            <div className="legend"><span><i className="swatch"></i>Available</span><span><i className="swatch dark"></i>Not Available</span></div>
            <textarea value={availNotes} onChange={(e)=>setAvailNotes(e.target.value)} placeholder="Notes optional" />
            <button className="gold-btn" onClick={saveAvailability}>Save Availability</button>
          </div>
        </section>}
        {page === "log" && <section className="page active"><div className="card"><h3>Log</h3><HourList hours={userHours} /></div></section>}
        {page === "profile" && <section className="page active"><div className="card" style={{textAlign:"center"}}>
          <div className="initials big-initials">{initials(user.full_name)}</div>
          <h3>{user.full_name}</h3>
          {!profileEdit ? <>
            <div className="record"><b>Email</b><br/><small>{user.email}</small></div>
            <div className="record"><b>Phone</b><br/><small>{user.phone || "Not set"}</small></div>
            <button className="gold-btn" onClick={startProfileEdit}>Edit Profile / Password</button>
          </> : <>
            <label>Full Name</label><input value={profileForm.full_name} onChange={(e)=>setProfileForm({...profileForm, full_name:e.target.value})}/>
            <label>Email</label><input value={profileForm.email} onChange={(e)=>setProfileForm({...profileForm, email:e.target.value})}/>
            <label>Phone</label><input value={profileForm.phone} onChange={(e)=>setProfileForm({...profileForm, phone:phoneFormat(e.target.value)})}/>
            <label>New Password</label><input type="password" value={profileForm.password} onChange={(e)=>setProfileForm({...profileForm, password:e.target.value})}/>
            <button className="gold-btn" onClick={saveProfile}>Save</button>
            <button className="ghost-btn full" onClick={()=>setProfileEdit(false)}>Cancel</button>
          </>}
          <button className="ghost-btn full logout-btn" onClick={logout}>Log Out</button>
        </div></section>}
      </main>
      <nav className="nav">
        <button className={`tab ${page==="home"?"active":""}`} onClick={()=>setPage("home")}>⌂<span>Home</span></button>
        <button className={`tab ${page==="hours"?"active":""}`} onClick={()=>setPage("hours")}>◷<span>Hours</span></button>
        <button className={`tab ${page==="availability"?"active":""}`} onClick={()=>setPage("availability")}>▣<span>Avail</span></button>
        <button className={`tab ${page==="log"?"active":""}`} onClick={()=>setPage("log")}>☰<span>Log</span></button>
        <button className={`tab ${page==="profile"?"active":""}`} onClick={()=>setPage("profile")}>◉<span>Profile</span></button>
      </nav>
    </div>
  );
}

function HoursForm({ onSubmit }) {
  const now = new Date();
  const years = [];
  for (let y = now.getFullYear() - 1; y <= 2030; y++) years.push(y);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const mins = ["00","15","30","45"];
  return <form onSubmit={onSubmit}>
    <label>Date</label>
    <div className="three">
      <select name="year" defaultValue={now.getFullYear()}>{years.map(y=><option key={y}>{y}</option>)}</select>
      <select name="month" defaultValue={now.getMonth()+1}>{months.map((m,i)=><option key={m} value={i+1}>{m}</option>)}</select>
      <select name="day" defaultValue={now.getDate()}>{days.map(d=><option key={d}>{d}</option>)}</select>
    </div>
    <label>Start Time</label>
    <div className="split">
      <select name="startHour" defaultValue="07">{hours.map(h=><option key={h}>{h}</option>)}</select>
      <select name="startMinute">{mins.map(m=><option key={m}>{m}</option>)}</select>
    </div>
    <label>End Time</label>
    <div className="split">
      <select name="endHour" defaultValue="16">{hours.map(h=><option key={h}>{h}</option>)}</select>
      <select name="endMinute" defaultValue="30">{mins.map(m=><option key={m}>{m}</option>)}</select>
    </div>
    <label>Notes</label>
    <textarea name="notes" placeholder="Optional notes" />
    <button className="gold-btn">Submit Hours</button>
  </form>;
}

function HourList({ hours }) {
  if (!hours.length) return <div className="record"><b>No hours submitted</b></div>;
  return hours.map(h => <div className="record" key={h.id}>
    <div className="record-top">
      <div><b>{h.date}</b><br/><small>{h.start_time}-{h.end_time} • {money(h.total_hours)} hrs</small></div>
      <div className={`status ${h.status}`}>{h.status === "rejected" ? "Denied" : h.status[0].toUpperCase()+h.status.slice(1)}</div>
    </div>
  </div>);
}

function Calendar({ month, setMonth, selectedDates, setSelectedDates, dateKey, clickable=false }) {
  const y = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(y,m,1).getDay();
  const last = new Date(y,m+1,0).getDate();
  const cells = [];
  for (let i=0;i<first;i++) cells.push(<button key={"b"+i} className="day blank"></button>);
  for (let d=1; d<=last; d++) {
    const key = dateKey(y,m,d);
    cells.push(<button key={key} className={`day ${selectedDates.has(key) ? "selected" : ""}`} onClick={()=> {
      if (!clickable) return;
      const next = new Set(selectedDates);
      next.has(key) ? next.delete(key) : next.add(key);
      setSelectedDates(next);
    }}>{d}</button>);
  }
  return <>
    <div className="calendar-head">
      <button onClick={()=>setMonth(new Date(y,m-1,1))}>‹</button>
      <strong>{month.toLocaleDateString("en-US", { month:"long", year:"numeric" })}</strong>
      <button onClick={()=>setMonth(new Date(y,m+1,1))}>›</button>
    </div>
    <div className="weekdays"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>
    <div className="days-grid">{cells}</div>
  </>;
}

function AdminPortal(props) {
  const { toast, logout, page, setPage, employees, allEmployees, hours, availability, setStatus, exportCsv, shiftPay, editEmp, empForm, setEmpForm, startEditEmployee, saveEmployee, removeEmployee, setEditEmp, earnMonth, setEarnMonth, earnYear, setEarnYear, adminAvailEmp, setAdminAvailEmp, adminAvailMonth, setAdminAvailMonth } = props;
  const pending = hours.filter(h=>h.status==="pending");
  const approved = hours.filter(h=>h.status==="approved");
  const payroll = approved.reduce((a,h)=>a+shiftPay(h),0);
  const employeeMap = Object.fromEntries(allEmployees.map(e=>[e.id,e]));

  const hourRecord = h => <div className="record" key={h.id}>
    <div className="record-top">
      <div><b>{employeeMap[h.employee_id]?.full_name || "Employee"}</b><br/><small>{h.date} • {h.start_time}-{h.end_time} • {money(h.total_hours)} hrs • ${money(shiftPay(h))}</small></div>
      <div className={`status ${h.status}`}>{h.status==="rejected" ? "Denied" : h.status[0].toUpperCase()+h.status.slice(1)}</div>
    </div>
    {h.status === "pending" && <div className="approve-row"><button className="approve" onClick={()=>setStatus(h.id,"approved")}>Approve</button><button className="reject" onClick={()=>setStatus(h.id,"rejected")}>Deny</button></div>}
  </div>;

  return <div className="admin-layout" style={{display:"block"}}>
    {toast && <div id="toast" style={{ display: "block" }}>{toast}</div>}
    <div className="admin-frame">
      <aside className="admin-side">
        <img className="logo" src={logo}/>
        <div className="admin-nav">
          {["dash","approvals","employees","availability"].map(p=><button key={p} className={page===p?"active":""} onClick={()=>setPage(p)}>{p==="dash"?"Dashboard":p[0].toUpperCase()+p.slice(1)}</button>)}
          <button onClick={exportCsv}>Export Payroll</button>
          <button onClick={logout}>Log Out</button>
        </div>
      </aside>
      <main className="admin-main">
        {page==="dash" && <section><h1>Admin Dashboard</h1>
          <div className="admin-grid">
            <div className="admin-card"><b>{employees.length}</b><span>Employees</span></div>
            <div className="admin-card"><b>{pending.length}</b><span>Pending Approvals</span></div>
            <div className="admin-card"><b>{money(hours.reduce((a,h)=>a+Number(h.total_hours||0),0))}</b><span>Total Hours</span></div>
            <div className="admin-card"><b>${money(payroll)}</b><span>Approved Payroll</span></div>
          </div>
          <div className="admin-cols">
            <div className="card"><h3>Recent Hours</h3>{hours.slice(0,5).map(hourRecord) || "No hours"}</div>
            <div className="card"><h3>Pending Approvals</h3>{pending.map(hourRecord)}{!pending.length && <div className="record"><b>No pending approvals</b></div>}</div>
          </div>
        </section>}
        {page==="approvals" && <section><h1>Approve Hours</h1><div className="card">{hours.map(hourRecord)}{!hours.length && <div className="record"><b>No hours submitted</b></div>}</div></section>}
        {page==="employees" && <EmployeesAdmin employees={employees} hours={hours} startEditEmployee={startEditEmployee} editEmp={editEmp} empForm={empForm} setEmpForm={setEmpForm} saveEmployee={saveEmployee} removeEmployee={removeEmployee} setEditEmp={setEditEmp} earnMonth={earnMonth} setEarnMonth={setEarnMonth} earnYear={earnYear} setEarnYear={setEarnYear}/>}
        {page==="availability" && <AvailabilityAdmin employees={employees} availability={availability} adminAvailEmp={adminAvailEmp} setAdminAvailEmp={setAdminAvailEmp} adminAvailMonth={adminAvailMonth} setAdminAvailMonth={setAdminAvailMonth}/>}
      </main>
    </div>

    <nav className="mobile-admin-topbar">
      <button className={page==="dash" ? "active" : ""} onClick={()=>setPage("dash")}>Dashboard</button>
      <button className={page==="approvals" ? "active" : ""} onClick={()=>setPage("approvals")}>Approvals</button>
      <button className={page==="employees" ? "active" : ""} onClick={()=>setPage("employees")}>Employees</button>
      <button className={page==="availability" ? "active" : ""} onClick={()=>setPage("availability")}>Availability</button>
      <button onClick={exportCsv}>Export</button>
      <button onClick={logout}>Logout</button>
    </nav>
  </div>;
}

function EmployeesAdmin({ employees, hours, startEditEmployee, editEmp, empForm, setEmpForm, saveEmployee, removeEmployee, setEditEmp, earnMonth, setEarnMonth, earnYear, setEarnYear }) {
  return <section>
    <h1>Employees</h1>
    <div className="card employee-table"><h3>Employee List</h3>{employees.map(e=><div className="record" key={e.id}><b>{e.full_name}</b><small>{e.role || "No role"} • ${money(e.hourly_rate)}/hr</small><small>{e.email}</small><button className="ghost-btn" onClick={()=>startEditEmployee(e)}>Edit</button></div>)}</div>
    <div className="card"><h3>Employee Earnings</h3>
      <div className="split">
        <select value={earnMonth} onChange={(e)=>setEarnMonth(Number(e.target.value))}>{["January","February","March","April","May","June","July","August","September","October","November","December"].map((m,i)=><option value={i+1} key={m}>{m}</option>)}</select>
        <select value={earnYear} onChange={(e)=>setEarnYear(Number(e.target.value))}>{Array.from({length:2030-new Date().getFullYear()+2},(_,i)=>new Date().getFullYear()-1+i).map(y=><option key={y}>{y}</option>)}</select>
      </div>
      {employees.map(emp => {
        const empHours = hours.filter(h => h.employee_id===emp.id && Number(String(h.date).split("-")[0])===earnYear && Number(String(h.date).split("-")[1])===earnMonth);
        const hrs = empHours.reduce((a,h)=>a+Number(h.total_hours||0),0);
        const earned = hrs * Number(emp.hourly_rate||0);
        const approved = empHours.filter(h=>h.status==="approved").reduce((a,h)=>a+Number(h.total_hours||0)*Number(emp.hourly_rate||0),0);
        const pending = empHours.filter(h=>h.status==="pending").reduce((a,h)=>a+Number(h.total_hours||0)*Number(emp.hourly_rate||0),0);
        return <div className="record" key={emp.id}><div className="record-top"><div><b>{emp.full_name}</b><br/><small>{money(hrs)} hrs • ${money(emp.hourly_rate)}/hr</small><br/><small>Approved: ${money(approved)} • Pending: ${money(pending)}</small></div><div className="status approved">${money(earned)}</div></div></div>
      })}
    </div>
    <div className="card"><h3>{editEmp ? "Edit Employee" : "Add Employee"}</h3>
      <label>Full Name</label><input value={empForm.full_name} onChange={(e)=>setEmpForm({...empForm, full_name:e.target.value})}/>
      <label>Role</label><input value={empForm.role} onChange={(e)=>setEmpForm({...empForm, role:e.target.value})}/>
      <label>Hourly Rate</label><input type="number" value={empForm.hourly_rate} onChange={(e)=>setEmpForm({...empForm, hourly_rate:e.target.value})}/>
      <label>Email</label><input value={empForm.email} onChange={(e)=>setEmpForm({...empForm, email:e.target.value})}/>
      <label>Phone</label><input value={empForm.phone} onChange={(e)=>setEmpForm({...empForm, phone:phoneFormat(e.target.value)})}/>
      <label>Password</label><input type="password" value={empForm.password} onChange={(e)=>setEmpForm({...empForm, password:e.target.value})}/>
      <button className="gold-btn" onClick={saveEmployee}>Save Employee</button>
      {editEmp && <button className="reject full" onClick={removeEmployee}>Remove Employee</button>}
      <button className="ghost-btn full" onClick={()=>{setEditEmp(null); setEmpForm({ full_name: "", role: "", hourly_rate: "", email: "", phone: "", password: "" });}}>Clear Form</button>
    </div>
  </section>
}

function AvailabilityAdmin({ employees, availability, adminAvailEmp, setAdminAvailEmp, adminAvailMonth, setAdminAvailMonth }) {
  const selectedEmp = adminAvailEmp || employees[0]?.id;
  useEffect(()=>{ if(!adminAvailEmp && employees[0]) setAdminAvailEmp(employees[0].id); }, [employees.length]);
  const dates = new Set(availability.filter(a=>a.employee_id===selectedEmp).map(a=>a.available_date));
  const notes = availability.find(a=>a.employee_id===selectedEmp)?.notes || "No notes submitted.";
  const empName = employees.find(e=>e.id===selectedEmp)?.full_name || "Employee";
  return <section><h1>Availability</h1><div className="card">
    <div className="admin-tabs">{employees.map(e=><button className={selectedEmp===e.id?"active":""} onClick={()=>setAdminAvailEmp(e.id)} key={e.id}>{e.full_name}</button>)}</div>
    <h3>{empName} Availability</h3>
    <Calendar month={adminAvailMonth} setMonth={setAdminAvailMonth} selectedDates={dates} setSelectedDates={()=>{}} dateKey={(y,m,d)=>`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`} />
    <div className="legend"><span><i className="swatch"></i>Available</span><span><i className="swatch dark"></i>Not Available</span></div>
    <div className="record"><b>Notes</b><br/><small>{notes}</small></div>
  </div></section>
}

createRoot(document.getElementById("root")).render(<App />);
