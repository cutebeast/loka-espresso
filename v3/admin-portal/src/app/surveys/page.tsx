"use client";

import { useEffect, useState } from "react";
import {
  api,
  getSurveys,
  createSurvey,
  deleteSurvey,
  getSurveyResponses,
  type Survey,
  type SurveyQuestion,
} from "@/lib/api";

export default function SurveysPage() {
  const [items, setItems] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Survey | null>(null);
  const [viewResponses, setViewResponses] = useState<number | null>(null);
  const [responses, setResponses] = useState<any[]>([]);
  const [responsesLoading, setResponsesLoading] = useState(false);

  const [form, setForm] = useState({
    survey_key: "",
    title: "",
    description: "",
    survey_type: "general",
    is_active: true,
    starts_at: "",
    ends_at: "",
    questions: [] as SurveyQuestion[],
  });

  const fetchData = () => {
    setLoading(true);
    getSurveys()
      .then((data) => setItems(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setForm({
      survey_key: "",
      title: "",
      description: "",
      survey_type: "general",
      is_active: true,
      starts_at: "",
      ends_at: "",
      questions: [],
    });
    setEditing(null);
    setShowForm(false);
  };

  const openEdit = (item: Survey) => {
    setEditing(item);
    setForm({
      survey_key: item.survey_key,
      title: item.title,
      description: item.description || "",
      survey_type: item.survey_type,
      is_active: item.is_active,
      starts_at: item.starts_at ? item.starts_at.slice(0, 10) : "",
      ends_at: item.ends_at ? item.ends_at.slice(0, 10) : "",
      questions: item.questions ? [...item.questions] : [],
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.patch(`/admin/surveys/${editing.id}`, form);
      } else {
        await createSurvey(form);
      }
      resetForm();
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure?")) return;
    try {
      await deleteSurvey(id);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const loadResponses = async (surveyId: number) => {
    setViewResponses(surveyId);
    setResponsesLoading(true);
    try {
      const data = await getSurveyResponses(surveyId);
      setResponses(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setResponsesLoading(false);
    }
  };

  const addQuestion = () => {
    setForm({
      ...form,
      questions: [
        ...form.questions,
        {
          question_text: "",
          question_type: "text",
          options: [],
          required: false,
          display_order: form.questions.length,
        },
      ],
    });
  };

  const updateQuestion = (index: number, patch: Partial<SurveyQuestion>) => {
    const updated = [...form.questions];
    updated[index] = { ...updated[index], ...patch };
    setForm({ ...form, questions: updated });
  };

  const removeQuestion = (index: number) => {
    const updated = form.questions.filter((_, i) => i !== index);
    setForm({ ...form, questions: updated });
  };

  const updateQuestionOptions = (index: number, raw: string) => {
    const options = raw.split(",").map((s) => s.trim()).filter(Boolean);
    updateQuestion(index, { options });
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Surveys</h1>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-700 transition"
        >
          Add Survey
        </button>
      </div>
      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}
      {showForm && (
        <div className="mb-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">{editing ? "Edit Survey" : "Add Survey"}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Survey Key</label>
              <input
                required
                value={form.survey_key}
                onChange={(e) => setForm({ ...form, survey_key: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <input
                required
                value={form.survey_type}
                onChange={(e) => setForm({ ...form, survey_type: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Start Date</label>
              <input
                type="date"
                value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Date</label>
              <input
                type="date"
                value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div className="flex items-center gap-2 md:col-span-2">
              <input
                id="sactive"
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              <label htmlFor="sactive" className="text-sm">
                Active
              </label>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border rounded px-3 py-2"
                rows={3}
              />
            </div>
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium">Questions</label>
                <button
                  type="button"
                  onClick={addQuestion}
                  className="text-sm bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded transition"
                >
                  + Add Question
                </button>
              </div>
              {form.questions.length === 0 && (
                <p className="text-sm text-gray-500">No questions added yet.</p>
              )}
              <div className="space-y-3">
                {form.questions.map((q, idx) => (
                  <div key={idx} className="border rounded p-3 bg-gray-50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium mb-1">Question Text</label>
                        <input
                          required
                          value={q.question_text}
                          onChange={(e) => updateQuestion(idx, { question_text: e.target.value })}
                          className="w-full border rounded px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Type</label>
                        <select
                          value={q.question_type}
                          onChange={(e) => updateQuestion(idx, { question_type: e.target.value as SurveyQuestion["question_type"] })}
                          className="w-full border rounded px-3 py-2 text-sm"
                        >
                          <option value="text">Text</option>
                          <option value="single_choice">Single Choice</option>
                          <option value="multiple_choice">Multiple Choice</option>
                          <option value="rating">Rating</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Display Order</label>
                        <input
                          type="number"
                          required
                          value={q.display_order}
                          onChange={(e) => updateQuestion(idx, { display_order: Number(e.target.value) })}
                          className="w-full border rounded px-3 py-2 text-sm"
                        />
                      </div>
                      {(q.question_type === "single_choice" || q.question_type === "multiple_choice") && (
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium mb-1">Options (comma separated)</label>
                          <input
                            value={(q.options || []).join(", ")}
                            onChange={(e) => updateQuestionOptions(idx, e.target.value)}
                            className="w-full border rounded px-3 py-2 text-sm"
                            placeholder="Option 1, Option 2, Option 3"
                          />
                        </div>
                      )}
                      <div className="md:col-span-2 flex items-center gap-2">
                        <input
                          id={`qreq-${idx}`}
                          type="checkbox"
                          checked={q.required}
                          onChange={(e) => updateQuestion(idx, { required: e.target.checked })}
                        />
                        <label htmlFor={`qreq-${idx}`} className="text-xs">
                          Required
                        </label>
                      </div>
                    </div>
                    <div className="mt-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeQuestion(idx)}
                        className="text-red-600 hover:underline text-xs"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2 md:col-span-2">
              <button
                type="submit"
                className="bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-700 transition"
              >
                Save
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300 transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
      {viewResponses && (
        <div className="mb-6 bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Survey Responses</h2>
            <button
              onClick={() => setViewResponses(null)}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              Close
            </button>
          </div>
          {responsesLoading ? (
            <div className="text-center text-gray-500 py-4">Loading...</div>
          ) : responses.length === 0 ? (
            <div className="text-center text-gray-500 py-4">No responses yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold">Customer</th>
                    <th className="text-left px-4 py-2 font-semibold">Submitted At</th>
                  </tr>
                </thead>
                <tbody>
                  {responses.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-4 py-2">{r.customer_name}</td>
                      <td className="px-4 py-2">{new Date(r.submitted_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Key</th>
              <th className="text-left px-4 py-3 font-semibold">Title</th>
              <th className="text-left px-4 py-3 font-semibold">Type</th>
              <th className="text-left px-4 py-3 font-semibold">Questions</th>
              <th className="text-left px-4 py-3 font-semibold">Responses</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  No surveys found.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-3 font-mono">{item.survey_key}</td>
                  <td className="px-4 py-3">{item.title}</td>
                  <td className="px-4 py-3">{item.survey_type}</td>
                  <td className="px-4 py-3">{item.questions?.length ?? 0}</td>
                  <td className="px-4 py-3">
                    {item.response_count !== undefined ? (
                      <button
                        onClick={() => loadResponses(item.id)}
                        className="text-blue-600 hover:underline"
                      >
                        {item.response_count}
                      </button>
                    ) : (
                      <button
                        onClick={() => loadResponses(item.id)}
                        className="text-blue-600 hover:underline"
                      >
                        View
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                        item.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {item.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => openEdit(item)} className="text-blue-600 hover:underline mr-3">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:underline">
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
