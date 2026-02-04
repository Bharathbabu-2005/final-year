import { useMemo, useState } from "react";

const API_BASE = "http://localhost:8000";

const initialResponse = {
  recognized_text: "",
  intent: "",
  parameters: {},
  status: "Waiting",
  tts_message: ""
};

const statusStyles = {
  Triggered: "text-emerald-300 bg-emerald-500/10 border-emerald-500/40",
  Waiting: "text-amber-200 bg-amber-500/10 border-amber-500/40",
  Completed: "text-sky-200 bg-sky-500/10 border-sky-500/40"
};

const toBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result?.toString() ?? "";
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const formatParams = (params) =>
  Object.entries(params)
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");

export default function App() {
  const [command, setCommand] = useState("");
  const [response, setResponse] = useState(initialResponse);
  const [isListening, setIsListening] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const statusBadge = useMemo(
    () => statusStyles[response.status] ?? statusStyles.Waiting,
    [response.status]
  );

  const handleSubmit = async (payload) => {
    setIsSubmitting(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/intent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error("Unable to reach the automation service.");
      }

      const data = await res.json();
      setResponse(data);

      if (data.tts_message) {
        const ttsRes = await fetch(`${API_BASE}/api/tts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ text: data.tts_message })
        });

        if (ttsRes.ok) {
          const audioData = await ttsRes.json();
          if (audioData.audio_base64) {
            const audio = new Audio(
              `data:audio/wav;base64,${audioData.audio_base64}`
            );
            audio.play();
          }
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unexpected error while contacting the service."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTextSubmit = async (event) => {
    event.preventDefault();
    if (!command.trim()) {
      setError("Enter a command before submitting.");
      return;
    }

    await handleSubmit({ mode: "text", text: command.trim() });
  };

  const handleSpeechCapture = async () => {
    if (isListening || isSubmitting) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone access is not supported in this browser.");
      return;
    }

    setIsListening(true);
    setError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: "audio/webm" });
        const base64 = await toBase64(blob);
        await handleSubmit({
          mode: "speech",
          audio_base64: base64,
          audio_format: "webm"
        });
        setIsListening(false);
      };

      recorder.start();
      setTimeout(() => recorder.stop(), 4000);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to record audio at this time."
      );
      setIsListening(false);
    }
  };

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-400">
            Final Year Project
          </p>
          <h1 className="text-3xl font-semibold text-white md:text-4xl">
            Intelligent Workflow Automation System
          </h1>
          <p className="max-w-2xl text-sm text-slate-300 md:text-base">
            Capture intent through voice or text. The automation layer is hidden,
            so you can focus on describing what you need done.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl shadow-slate-950/40">
          <form onSubmit={handleTextSubmit} className="space-y-4">
            <label className="text-sm font-medium text-slate-200">
              Command
            </label>
            <textarea
              rows={3}
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="Example: Schedule a meeting with the AI team tomorrow at 10am."
              className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 shadow-inner focus:border-slate-500 focus:outline-none"
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  className="rounded-full bg-slate-100 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Sending..." : "Submit Command"}
                </button>
                <button
                  type="button"
                  onClick={handleSpeechCapture}
                  className="rounded-full border border-slate-700 px-5 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-500 hover:bg-slate-800/40 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={isListening || isSubmitting}
                >
                  {isListening ? "Listening..." : "Use Microphone"}
                </button>
              </div>
              <p className="text-xs text-slate-400">
                Voice capture records ~4 seconds of audio.
              </p>
            </div>
          </form>
          {error && (
            <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Recognized Command
            </p>
            <p className="mt-2 text-sm text-slate-100">
              {response.recognized_text || "Awaiting input..."}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Detected Intent
            </p>
            <p className="mt-2 text-lg font-semibold text-white">
              {response.intent || "—"}
            </p>
            {response.parameters &&
              Object.keys(response.parameters).length > 0 && (
                <p className="mt-2 text-xs text-slate-400">
                  {formatParams(response.parameters)}
                </p>
              )}
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Workflow Status
            </p>
            <div
              className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusBadge}`}
            >
              {response.status}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {response.tts_message || "System ready for instructions."}
            </p>
          </div>
        </section>

        <footer className="text-xs text-slate-500">
          Automation services are abstracted. This interface captures intent only
          and returns mocked workflow confirmations.
        </footer>
      </div>
    </div>
  );
}
