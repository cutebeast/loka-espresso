"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save, RefreshCw, Plus } from "lucide-react";

const LOCALES = [{code:"en",label:"English",flag:"🇬🇧"},{code:"ms",label:"BM",flag:"🇲🇾"},{code:"zh",label:"中文",flag:"🇨🇳"},{code:"ta",label:"தமிழ்",flag:"🇮🇳"},{code:"tr",label:"TR",flag:"🇹🇷"}];
const TR_FIELDS = [{key:"survey_name",label:"Title"},{key:"description",label:"Description"}];
const MAX_Q = 5;

export default function SurveyEditPage() {
  const p = useParams(); const r = useRouter(); const id = p.id as string;
  const [loading,setLoading] = useState(true);
  const [loc,setLoc] = useState("en");
  const [saving,setSaving] = useState(false);
  const [savingTr,setSavingTr] = useState(false);
  const [msg,setMsg] = useState("");
  const [regen,setRegen] = useState(false);
  const [form,setForm] = useState<Record<string,any>>({questions:[]});
  const [tr,setTr] = useState<Record<string,string>>({});
  const [qTr,setQTr] = useState<{questions:{id:number;text:string;options:string[]}[]}>({questions:[]});

  const load = useCallback(async () => {
    try {
      const d = await api.getRaw<any>(`/admin/surveys/${id}`);
      const qs = (d.questions||[]).map((q:any)=>({
        id:q.id, text:q.question_text,
        options: q.answer_options?.choices || q.options || [],
      }));
      setForm({
        survey_key:d.survey_key||"", survey_name:d.survey_name||"",
        description:d.description||"", is_active:d.is_active,
        questions:(d.questions||[]).map((q:any)=>({
          ...q, options: q.answer_options?.choices || q.options || [],
        })),
      });
      setQTr({questions:qs});
      // Load translations
      const x:Record<string,string>={};
      for(const lc of LOCALES){
        if(lc.code==="en")continue;
        try{const rt=await api.getRaw<any>(`/admin/translations?table_name=survey_definitions&record_id=${id}&locale=${lc.code}&per_page=50`);if(rt?.items)for(const t of rt.items){const f=t.translation_key.split(".").pop()||"";x[`${lc.code}:${f}`]=t.translated_text||"";}}catch{}
        try{const qt=await api.getRaw<any>(`/admin/translations?table_name=survey_questions&locale=${lc.code}&per_page=100`);if(qt?.items)for(const t of qt.items){const c=t.column_name;if(c==="question_text")x[`${lc.code}:q:${t.record_id}`]=t.translated_text||"";else if(c.startsWith("option_")){const oi=parseInt(c.split("_")[1]);x[`${lc.code}:qopt:${t.record_id}_${oi}`]=t.translated_text||"";}}}catch{}
      }
      setTr(x);
    } catch {} finally { setLoading(false); }
  }, [id]);

  useEffect(()=>{(async () => {
load();
})();},[load]);

  // Question CRUD
  const addQ = () => { if(form.questions.length>=MAX_Q)return; setForm({...form,questions:[...form.questions,{question_text:"",question_type:"text_open",is_required:false,display_order:form.questions.length,options:[]}]}); };
  const updateQ = (i:number,p:any)=>{const q=[...form.questions];q[i]={...q[i],...p,question_type:p.question_type||q[i].question_type,options:p.question_type==="text_open"||p.question_type==="rating_scale"?[]:(p.options||q[i].options)};setForm({...form,questions:q});};
  const removeQ = (i:number)=>setForm({...form,questions:form.questions.filter((_:any,j:number)=>j!==i)});

  // Option CRUD
  const addOpt = (qi:number)=>{const q=[...form.questions];q[qi].options.push("");setForm({...form,questions:q});};
  const updateOpt = (qi:number,oi:number,val:string)=>{const q=[...form.questions];q[qi].options[oi]=val;setForm({...form,questions:q});};
  const removeOpt = (qi:number,oi:number)=>{const q=[...form.questions];q[qi].options=q[qi].options.filter((_:string,j:number)=>j!==oi);setForm({...form,questions:q});};

  const save = async () => { setSaving(true);
    try {
      const pl:any = {survey_key:form.survey_key,survey_name:form.survey_name,description:form.description,is_active:form.is_active};
      pl.questions = form.questions.map((q:any)=>{
        if(q.question_type==="single_choice"||q.question_type==="multiple_choice") return {...q,options:q.options||[],answer_options:{choices:q.options||[]}};
        return q;
      });
      await api.put(`/admin/surveys/${id}`,pl);
      // Reload IDs for newly created questions
      const d = await api.getRaw<any>(`/admin/surveys/${id}`);
      const qs = (d.questions||[]).map((q:any)=>({id:q.id,text:q.question_text,options:q.answer_options?.choices||q.options||[]}));
      setQTr({questions:qs});
      setMsg("Saved"); setTimeout(()=>setMsg(""),2000);
    } catch {} finally { setSaving(false); }
  };

  const upsertTr = async(field:string,locale:string,src:string,text:string,tableName:string="survey_definitions",recordId:number=Number(id))=>{
    try{const rt=await api.getRaw<any>(`/admin/translations?table_name=${tableName}&record_id=${recordId}&column_name=${field}&locale=${locale}&per_page=1`);const ex=rt?.items?.[0];if(ex)await api.put(`/admin/translations/${ex.id}`,{translated_text:text});else await api.post("/admin/translations",{translation_key:`${tableName}.${recordId}.${field}`,locale,namespace:"survey",translated_text:text,source_text:src,table_name:tableName,record_id:recordId,column_name:field});}catch{}
  };

  const regenAll = async () => { setRegen(true); let c=0;
    for(const f of TR_FIELDS){const src=(form[f.key]||"").trim();if(!src)continue;try{const rt:any=await api.post("/admin/translations/translate",{text:src,target_locale:loc,source_locale:"en"});if(rt?.translated_text){setTr(p=>({...p,[`${loc}:${f.key}`]:rt.translated_text}));await upsertTr(f.key,loc,src,rt.translated_text);c++;}}catch{}}
    for(const q of qTr.questions){
      const src=(q.text||"").trim();if(!src)continue;try{const rt:any=await api.post("/admin/translations/translate",{text:src,target_locale:loc,source_locale:"en"});if(rt?.translated_text){setTr(p=>({...p,[`${loc}:q:${q.id}`]:rt.translated_text}));await upsertTr("question_text",loc,src,rt.translated_text,"survey_questions",q.id);c++;}}catch{}
      for(let oi=0;oi<(q.options||[]).length;oi++){const opt=q.options[oi].trim();if(!opt)continue;try{const rt:any=await api.post("/admin/translations/translate",{text:opt,target_locale:loc,source_locale:"en"});if(rt?.translated_text){setTr(p=>({...p,[`${loc}:qopt:${q.id}_${oi}`]:rt.translated_text}));await upsertTr(`option_${oi}`,loc,opt,rt.translated_text,"survey_questions",q.id);c++;}}catch{}}
    }
    setMsg(`Regenerated ${c} fields & options`);setTimeout(()=>setMsg(""),2500);setRegen(false);
  };

  const saveAllTr = async () => {setSavingTr(true);
    for(const f of TR_FIELDS){const t=tr[`${loc}:${f.key}`]||"";if(t)await upsertTr(f.key,loc,(form[f.key]||"").trim(),t);}
    for(const q of qTr.questions){const t=tr[`${loc}:q:${q.id}`]||"";if(t)await upsertTr("question_text",loc,q.text,t,"survey_questions",q.id);
      for(let oi=0;oi<(q.options||[]).length;oi++){const ot=tr[`${loc}:qopt:${q.id}_${oi}`]||"";if(ot)await upsertTr(`option_${oi}`,loc,q.options[oi],ot,"survey_questions",q.id);}
    }
    setMsg("Translations saved");setTimeout(()=>setMsg(""),2000);setSavingTr(false);
  };

  if(loading)return <div style={{padding:32}}>Loading...</div>;

  return (
    <div style={{padding:32}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}><button onClick={()=>r.push("/surveys")} className="btn btn-ghost btn-sm"><ArrowLeft size={18}/></button><div><h1 className="page-title" style={{margin:0}}>{form.survey_name||"Survey"}</h1></div></div>
      {msg&&<div className="alert alert-success" style={{marginBottom:12}}>{msg}</div>}
      <div style={{display:"flex",gap:4,marginBottom:20,borderBottom:"2px solid var(--color-border-light)",paddingBottom:0}}>{LOCALES.map(lc=>(<button key={lc.code} onClick={()=>setLoc(lc.code)} style={{padding:"10px 20px",fontSize:13,fontWeight:loc===lc.code?700:400,border:"none",borderBottom:loc===lc.code?"3px solid var(--color-primary)":"3px solid transparent",background:loc===lc.code?"rgba(59,74,26,0.05)":"transparent",cursor:"pointer",color:loc===lc.code?"var(--color-primary)":"var(--color-text-muted)",borderRadius:"4px 4px 0 0"}}>{lc.flag} {lc.label}</button>))}</div>

      {loc==="en"?(
        <div className="card" style={{padding:24,maxWidth:700}}>
          <h3 style={{marginBottom:20}}>English (Source Content)</h3>
          <div className="df-grid">
            <div className="df-field"><label className="df-label">Key</label><input value={form.survey_key} onChange={e=>setForm({...form,survey_key:e.target.value})}/></div>
            <div className="df-field"><label className="df-label">Title *</label><input required value={form.survey_name} onChange={e=>setForm({...form,survey_name:e.target.value})}/></div>
            <div className="df-field" style={{gridColumn:"1/-1"}}><label className="df-label">Description</label><textarea rows={3} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></div>
            <div className="df-field"><label className="df-label" style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" checked={form.is_active} onChange={e=>setForm({...form,is_active:e.target.checked})}/> Active</label></div>
            <div className="df-field" style={{gridColumn:"1/-1"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,paddingBottom:6,borderBottom:"1px solid var(--color-border-light)"}}><label className="df-label" style={{margin:0}}>Questions ({form.questions.length}/{MAX_Q})</label>{form.questions.length<MAX_Q&&<button type="button" onClick={addQ} className="btn btn-sm btn-outline"><Plus size={14}/> Add Question</button>}</div>
              {form.questions.map((q:any,qi:number)=>(
                <div key={qi} style={{background:"var(--color-bg-muted)",borderRadius:"var(--radius-sm)",padding:12,marginBottom:10,border:"1px solid var(--color-border-light)"}}>
                  <div style={{display:"flex",gap:6,marginBottom:6}}>
                    <input value={q.question_text} onChange={e=>updateQ(qi,{question_text:e.target.value})} placeholder={`Question ${qi+1}`} style={{flex:1}}/>
                    <select value={q.question_type} onChange={e=>updateQ(qi,{question_type:e.target.value})} style={{width:110}}><option value="text_open">Text</option><option value="single_choice">Single Choice</option><option value="multiple_choice">Multi Choice</option><option value="rating_scale">Rating</option></select>
                    <label style={{fontSize:11,display:"flex",alignItems:"center",gap:3}}><input type="checkbox" checked={q.is_required} onChange={e=>updateQ(qi,{is_required:e.target.checked})}/>Req</label>
                    <button type="button" onClick={()=>removeQ(qi)} className="btn btn-ghost btn-sm" style={{color:"var(--color-error)"}}>✕</button>
                  </div>
                  {(q.question_type==="single_choice"||q.question_type==="multiple_choice")&&(
                    <div style={{paddingLeft:8}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}><span style={{fontSize:10,color:"var(--color-text-muted)",textTransform:"uppercase"}}>Options</span><button type="button" onClick={()=>addOpt(qi)} className="btn btn-ghost btn-sm" style={{fontSize:11,color:"var(--color-info)"}}>+ Add Option</button></div>
                      {(q.options||[]).map((opt:string,oi:number)=>(
                        <div key={oi} style={{display:"flex",gap:4,marginBottom:3}}>
                          <input value={opt} onChange={e=>updateOpt(qi,oi,e.target.value)} placeholder={`Option ${oi+1}`} style={{flex:1,fontSize:12,padding:"4px 8px",border:"1px solid var(--color-border-light)",borderRadius:"var(--radius-sm)"}}/>
                          <button type="button" onClick={()=>removeOpt(qi,oi)} className="btn btn-ghost btn-sm" style={{color:"var(--color-error)"}}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="df-actions" style={{marginTop:20}}><button type="button" onClick={()=>r.push("/surveys")} className="btn btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="btn btn-primary"><Save size={16}/>{saving?"Saving...":"Save Changes"}</button></div>
        </div>
      ):(
        <div className="card" style={{padding:24,maxWidth:700}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><h3 style={{margin:0}}>{LOCALES.find(l=>l.code===loc)?.flag} {LOCALES.find(l=>l.code===loc)?.label} Translation</h3><button onClick={regenAll} disabled={regen} className="btn btn-primary btn-sm"><RefreshCw size={14}/>{regen?"...":"Regenerate All"}</button></div>
          <div className="df-grid">{TR_FIELDS.map(f=>{const k=`${loc}:${f.key}`;const isTA=f.key==="description";return(<div className="df-field" key={f.key} style={isTA?{gridColumn:"1/-1"}:{}}><label style={{fontSize:11,fontWeight:600,color:"var(--color-text-muted)"}}>{f.label}<span style={{fontWeight:400,fontStyle:"italic",marginLeft:8}}>EN:{(form[f.key]||"").slice(0,40)}</span></label>{isTA?<textarea rows={3} value={tr[k]||""} onChange={e=>setTr(p=>({...p,[k]:e.target.value}))} style={{width:"100%",padding:"8px 10px",fontSize:13,border:tr[k]?"1px solid var(--color-border-light)":"2px solid #FCD34D",borderRadius:"var(--radius-sm)",background:tr[k]?"var(--color-bg-white)":"#FFFBEB"}}/>:<input value={tr[k]||""} onChange={e=>setTr(p=>({...p,[k]:e.target.value}))} style={{width:"100%",padding:"8px 10px",fontSize:13,border:tr[k]?"1px solid var(--color-border-light)":"2px solid #FCD34D",borderRadius:"var(--radius-sm)",background:tr[k]?"var(--color-bg-white)":"#FFFBEB"}}/>}</div>);})}</div>
          {/* Questions section */}
          {qTr.questions.length>0&&(<div style={{marginTop:16}}><h4 style={{fontSize:11,fontWeight:700,textTransform:"uppercase",color:"var(--color-text-muted)",borderBottom:"1px solid var(--color-border-light)",paddingBottom:4,marginBottom:10}}>Questions</h4><div className="df-grid">{qTr.questions.map((q:any)=>(<div key={q.id}><div className="df-field"><label style={{fontSize:10,fontWeight:600,color:"var(--color-text-muted)"}}>Q: {q.text.slice(0,50)}</label><input value={tr[`${loc}:q:${q.id}`]||""} onChange={e=>setTr(p=>({...p,[`${loc}:q:${q.id}`]:e.target.value}))} style={{width:"100%",padding:"8px 10px",fontSize:13,border:tr[`${loc}:q:${q.id}`]?"1px solid var(--color-border-light)":"2px solid #FCD34D",borderRadius:"var(--radius-sm)",background:tr[`${loc}:q:${q.id}`]?"var(--color-bg-white)":"#FFFBEB"}}/></div>{(q.options||[]).length>0&&(<div style={{paddingLeft:12,marginTop:4}}>{q.options.map((opt:string,oi:number)=>(<div className="df-field" key={oi}><label style={{fontSize:9,color:"var(--color-text-muted)"}}>→ Option {oi+1}: {opt}</label><input value={tr[`${loc}:qopt:${q.id}_${oi}`]||""} onChange={e=>setTr(p=>({...p,[`${loc}:qopt:${q.id}_${oi}`]:e.target.value}))} style={{width:"100%",padding:"6px 8px",fontSize:12,border:tr[`${loc}:qopt:${q.id}_${oi}`]?"1px solid var(--color-border-light)":"2px solid #FCD34D",borderRadius:"var(--radius-sm)",background:tr[`${loc}:qopt:${q.id}_${oi}`]?"var(--color-bg-white)":"#FFFBEB"}}/></div>))}</div>)}</div>))}</div></div>)}
          <div style={{marginTop:20}}><button onClick={saveAllTr} disabled={savingTr} className="btn btn-primary"><Save size={16}/>Save Translations</button></div>
        </div>
      )}
    </div>
  );
}
