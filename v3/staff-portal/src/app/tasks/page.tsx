"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMyTasks, completeMyTask, type StaffTask } from "@/lib/api";
import { ChevronLeft, CheckCircle2, Circle, Calendar } from "lucide-react";
function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}
function priorityColor(priority: string): string {
  const map: Record<string, string> = {
    low: "#6B7280",
    normal: "#2563EB",
    high: "#D97706",
    urgent: "#DC2626"
  };
  return map[priority] || "#6B7280";
}
export default function TasksPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const [tasks, setTasks] = useState<StaffTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [completing, setCompleting] = useState<number | null>(null);
  const fetchTasks = async () => {
    try {
      const data = await getMyTasks();
      setTasks(data || []);
    } catch (e) {
      console.error(e);
      setError("Could not load tasks");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchTasks();
  }, []);
  const handleComplete = async (taskId: number) => {
    setCompleting(taskId);
    try {
      await completeMyTask(taskId);
      await fetchTasks();
    } catch (e) {
      console.error(e);
      setError("Failed to complete task");
    } finally {
      setCompleting(null);
    }
  };
  const pending = tasks.filter(task => task.status !== "completed" && task.status !== "cancelled");
  const completed = tasks.filter(task => task.status === "completed");
  return <div style={{
    padding: 24,
    maxWidth: 720,
    margin: "0 auto"
  }}>
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 20
    }}>
        <button onClick={() => router.push("/")} className="btn btn-ghost btn-sm" style={{
        padding: 8
      }}>
          <ChevronLeft size={20} />
        </button>
        <h1 style={{
        fontSize: 20,
        fontWeight: 800,
        margin: 0
      }}>{t("tasks.my_tasks")}</h1>
      </div>

      {error && <p style={{
      color: "var(--color-error)",
      marginBottom: 12
    }}>{error}</p>}

      {loading ? <p style={{
      color: "var(--color-text-muted)"
    }}>{t("tasks.loading")}</p> : pending.length === 0 && completed.length === 0 ? <div className="card" style={{
      padding: 24,
      textAlign: "center"
    }}>
          <CheckCircle2 size={40} style={{
        opacity: 0.3,
        marginBottom: 12
      }} />
          <p style={{
        color: "var(--color-text-muted)"
      }}>{t("tasks.no_tasks_assigned")}</p>
        </div> : <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 12
    }}>
          {pending.map(task => <div key={task.id} className="card" style={{
        padding: 16
      }}>
              <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start"
        }}>
                <div>
                  <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 4
            }}>
                    <span style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                padding: "2px 6px",
                borderRadius: 4,
                color: "white",
                background: priorityColor(task.priority)
              }}>
                      {task.priority}
                    </span>
                    {task.due_date && <span style={{
                fontSize: 12,
                color: "var(--color-text-muted)",
                display: "flex",
                alignItems: "center",
                gap: 4
              }}>
                        <Calendar size={12} />{t("tasks.due")}{formatDate(task.due_date)}
                      </span>}
                  </div>
                  <h3 style={{
              margin: "4px 0",
              fontSize: 15,
              fontWeight: 700
            }}>{task.title}</h3>
                  {task.description && <p style={{
              margin: 0,
              fontSize: 13,
              color: "var(--color-text-muted)"
            }}>{task.description}</p>}
                </div>
                <button onClick={() => handleComplete(task.id)} disabled={completing === task.id} className="btn btn-primary btn-sm" style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            whiteSpace: "nowrap"
          }}>
                  <Circle size={14} /> {completing === task.id ? "..." : t("tasks.complete")}
                </button>
              </div>
            </div>)}

          {completed.length > 0 && <>
              <h2 style={{
          fontSize: 12,
          fontWeight: 700,
          color: "var(--color-text-muted)",
          textTransform: "uppercase",
          margin: "16px 0 8px 4px"
        }}>{t("tasks.completed")}</h2>
              {completed.map(task => <div key={task.id} className="card" style={{
          padding: 12,
          opacity: 0.6
        }}>
                  <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8
          }}>
                    <CheckCircle2 size={16} color="#059669" />
                    <span style={{
              textDecoration: "line-through",
              fontSize: 14
            }}>{task.title}</span>
                  </div>
                </div>)}
            </>}
        </div>}
    </div>;
}