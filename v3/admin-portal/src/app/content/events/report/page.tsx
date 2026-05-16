"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft } from "lucide-react";

interface Event { id:number; title:string; location?:string; event_datetime?:string; rsvp_enabled:boolean; rsvp_max_capacity?:number; rsvp_count:number; is_active:boolean; }

export default function EventRsvpReportPage() {
  const router = useRouter();
  const [items, setItems] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetch = useCallback(() => { setLoading(true);
    api.get<{items:Event[]}>("/admin/event-cards?per_page=100")
      .then(d => setItems((Array.isArray(d)?d:(d.items||[])).filter(e=>e.rsvp_enabled)))
      .catch(e=>setError(e.message)).finally(()=>setLoading(false));
  }, []);
  useEffect(()=>{(async () => {
fetch();
})();},[fetch]);

  const totalRsvp = items.reduce((s,i)=>s+(i.rsvp_count||0),0);

  return (
    <div style={{padding:32}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={()=>router.push("/content/events")} className="btn btn-ghost btn-sm"><ArrowLeft size={18}/></button>
        <div><h1 className="page-title" style={{margin:0}}>Event RSVP Report</h1><p className="page-subtitle" style={{marginTop:2}}>{items.length} events with RSVP · {totalRsvp} total sign-ups</p></div>
      </div>
      {error&&<div className="alert alert-error">{error}</div>}

      <div className="kpi-grid" style={{marginBottom:24}}>
        <div className="kpi-card"><div className="kpi-label">Events with RSVP</div><div className="kpi-value">{items.length}</div></div>
        <div className="kpi-card"><div className="kpi-label">Total Sign-ups</div><div className="kpi-value">{totalRsvp}</div></div>
      </div>

      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length} events</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>Event</th><th>Location</th><th>Date</th><th>Capacity</th><th>Sign-ups</th><th>Fill %</th><th>Status</th></tr></thead>
        <tbody>
          {loading?<tr><td colSpan={7} className="data-table-empty">Loading...</td></tr>
          :items.map(e=>{ const pct=e.rsvp_max_capacity?Math.round((e.rsvp_count/e.rsvp_max_capacity)*100):0;
            return (<tr key={e.id} style={{cursor:"pointer"}} onClick={()=>router.push(`/content/events/${e.id}`)}>
              <td style={{fontWeight:600}}>{e.title}</td>
              <td>{e.location||"—"}</td>
              <td style={{fontSize:12}}>{e.event_datetime?.slice(0,16)?.replace("T"," ")||"—"}</td>
              <td>{e.rsvp_max_capacity||"∞"}</td>
              <td style={{fontWeight:600}}>{e.rsvp_count}</td>
              <td><span className={`badge badge-sm ${pct>=80?"badge-red":pct>=50?"badge-yellow":"badge-green"}`}>{pct}%</span></td>
              <td><span className={`badge badge-sm ${e.is_active?"badge-green":"badge-gray"}`}>{e.is_active?"Active":"Inactive"}</span></td>
            </tr>);
          })}
        </tbody>
      </table></div>
    </div>
  );
}
