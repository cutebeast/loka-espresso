"use client";

import { useTranslation } from "@/lib/i18n";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save, Plus } from "lucide-react";
const MAX_Q = 5;
interface SurveyQuestion {
  question_text: string;
  question_type: string;
  options: string[];
  is_required: boolean;
  display_order: number;
}
export default function SurveyNewPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    survey_key: "",
    survey_name: "",
    description: "",
    is_active: true,
    questions: [] as SurveyQuestion[]
  });
  const addQ = () => {
    if (form.questions.length >= MAX_Q) return;
    setForm({
      ...form,
      questions: [...form.questions, {
        question_text: "",
        question_type: "text_open",
        is_required: false,
        display_order: form.questions.length,
        options: []
      } as SurveyQuestion]
    });
  };
  const updateQ = (i: number, p: Partial<SurveyQuestion>) => {
    const q = [...form.questions];
    const cur = q[i];
    if (!cur) return;
    q[i] = {
      ...cur,
      ...p,
      question_type: p.question_type || cur.question_type,
      options: p.question_type === "text_open" || p.question_type === "rating_scale" ? [] : p.options || cur.options
    };
    setForm({
      ...form,
      questions: q
    });
  };
  const removeQ = (i: number) => setForm({
    ...form,
    questions: form.questions.filter((_, j) => j !== i)
  });
  const addOpt = (qi: number) => {
    const q = [...form.questions];
    const cur = q[qi];
    if (!cur) return;
    q[qi] = {
      ...cur,
      options: [...cur.options, ""]
    };
    setForm({
      ...form,
      questions: q
    });
  };
  const updateOpt = (qi: number, oi: number, val: string) => {
    const q = [...form.questions];
    const cur = q[qi];
    if (!cur) return;
    q[qi] = {
      ...cur,
      options: cur.options.map((o: string, j: number) => j === oi ? val : o)
    };
    setForm({
      ...form,
      questions: q
    });
  };
  const removeOpt = (qi: number, oi: number) => {
    const q = [...form.questions];
    const cur = q[qi];
    if (!cur) return;
    q[qi] = {
      ...cur,
      options: cur.options.filter((_: string, j: number) => j !== oi)
    };
    setForm({
      ...form,
      questions: q
    });
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = {
        ...form,
        survey_key: form.survey_key || form.survey_name.toLowerCase().replace(/[^a-z0-9]/g, "_")
      };
      payload.questions = form.questions.map((q: any) => q.options && (q.question_type === "single_choice" || q.question_type === "multiple_choice") ? {
        ...q,
        answer_options: {
          choices: q.options
        }
      } : q);
      await api.post("/admin/surveys", payload);
      router.push("/surveys");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };
  return <div style={{
    padding: 32
  }}>
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 20
    }}>
        <button onClick={() => router.push("/surveys")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div><h1 className="page-title" style={{
          margin: 0
        }}>{t("surveys_new.new_survey")}</h1><p className="page-subtitle" style={{
          marginTop: 2
        }}>{t("surveys_new.create_a_survey_with_up_to")}</p></div>
      </div>
      {error && <div className="alert alert-error" style={{
      marginBottom: 16
    }}>{error}</div>}

      <div className="card" style={{
      padding: 24,
      maxWidth: 700
    }}>
        <form onSubmit={handleSubmit}><div className="df-grid">
          <div className="df-field"><label className="df-label">{t("surveys_new.key")}</label><input value={form.survey_key} onChange={e => setForm({
              ...form,
              survey_key: e.target.value
            })} placeholder={t("surveys_new.auto_generated")} /></div>
          <div className="df-field"><label className="df-label">{t("surveys_new.title")}</label><input required value={form.survey_name} onChange={e => setForm({
              ...form,
              survey_name: e.target.value
            })} /></div>
          <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="df-label">{t("surveys_new.description")}</label><textarea rows={3} value={form.description} onChange={e => setForm({
              ...form,
              description: e.target.value
            })} /></div>
          <div className="df-field"><label className="df-label" style={{
              display: "flex",
              alignItems: "center",
              gap: 8
            }}><input type="checkbox" checked={form.is_active} onChange={e => setForm({
                ...form,
                is_active: e.target.checked
              })} />{t("surveys_new.active")}</label></div>
          <div className="df-field" style={{
            gridColumn: "1/-1"
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
              paddingBottom: 6,
              borderBottom: "1px solid var(--color-border-light)"
            }}><label className="df-label" style={{
                margin: 0
              }}>{t("surveys_new.questions")}{form.questions.length}/{MAX_Q})</label>{form.questions.length < MAX_Q && <button type="button" onClick={addQ} className="btn btn-sm btn-outline"><Plus size={14} />{t("surveys_new.add_question")}</button>}</div>
            {form.questions.map((q, qi) => <div key={qi} style={{
              background: "var(--color-bg-muted)",
              borderRadius: "var(--radius-sm)",
              padding: 12,
              marginBottom: 10,
              border: "1px solid var(--color-border-light)"
            }}>
                <div style={{
                display: "flex",
                gap: 6,
                marginBottom: 6
              }}>
                  <input value={q.question_text} onChange={e => updateQ(qi, {
                  question_text: e.target.value
                })} placeholder={`Question ${qi + 1}`} style={{
                  flex: 1
                }} />
                  <select value={q.question_type} onChange={e => updateQ(qi, {
                  question_type: e.target.value
                })} style={{
                  width: 110
                }}><option value="text_open">{t("surveys_new.text")}</option><option value="single_choice">{t("surveys_new.single_choice")}</option><option value="multiple_choice">{t("surveys_new.multi_choice")}</option><option value="rating_scale">{t("surveys_new.rating")}</option></select>
                  <label style={{
                  fontSize: 11,
                  display: "flex",
                  alignItems: "center",
                  gap: 3
                }}><input type="checkbox" checked={q.is_required} onChange={e => updateQ(qi, {
                    is_required: e.target.checked
                  })} />{t("surveys_new.req")}</label>
                  <button type="button" onClick={() => removeQ(qi)} className="btn btn-ghost btn-sm" style={{
                  color: "var(--color-error)"
                }}>✕</button>
                </div>
                {(q.question_type === "single_choice" || q.question_type === "multiple_choice") && <div style={{
                paddingLeft: 8
              }}>
                    <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 4
                }}><span style={{
                    fontSize: 10,
                    color: "var(--color-text-muted)",
                    textTransform: "uppercase"
                  }}>{t("surveys_new.options")}</span><button type="button" onClick={() => addOpt(qi)} className="btn btn-ghost btn-sm" style={{
                    fontSize: 11,
                    color: "var(--color-info)"
                  }}>{t("surveys_new.add_option")}</button></div>
                    {(q.options || []).map((opt: string, oi: number) => <div key={oi} style={{
                  display: "flex",
                  gap: 4,
                  marginBottom: 3
                }}>
                        <input value={opt} onChange={e => updateOpt(qi, oi, e.target.value)} placeholder={`Option ${oi + 1}`} style={{
                    flex: 1,
                    fontSize: 12,
                    padding: "4px 8px",
                    border: "1px solid var(--color-border-light)",
                    borderRadius: "var(--radius-sm)"
                  }} />
                        <button type="button" onClick={() => removeOpt(qi, oi)} className="btn btn-ghost btn-sm" style={{
                    color: "var(--color-error)"
                  }}>✕</button>
                      </div>)}
                  </div>}
              </div>)}
          </div>
        </div><div className="df-actions" style={{
          marginTop: 20
        }}><button type="button" onClick={() => router.push("/surveys")} className="btn btn-ghost">{t("surveys_new.cancel")}</button><button type="submit" className="btn btn-primary" disabled={saving}><Save size={16} /> {saving ? "Creating..." : "Create Survey"}</button></div></form>
      </div>
    </div>;
}