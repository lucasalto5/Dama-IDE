import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/instrument-serif/400.css";
import "./styles.css";

function renderFatalError(error: unknown) {
  const root = document.getElementById("root");
  if (!root) return;
  const detail = error instanceof Error ? error.message : String(error || "Erro desconhecido");
  root.innerHTML = `
    <main style="min-height:100vh;display:grid;place-items:center;background:#171714;color:#f0eee7;font-family:'DM Sans',sans-serif;padding:32px;box-sizing:border-box">
      <section style="width:min(620px,100%);border:1px solid #38372f;border-radius:14px;padding:28px;background:#1d1d19">
        <h1 style="font-size:20px;margin:0 0 10px">A Dama não conseguiu abrir</h1>
        <p style="color:#aaa89f;line-height:1.55;margin:0 0 18px">A interface encontrou um erro durante a inicialização. Feche o aplicativo e abra novamente. Se continuar, envie a mensagem abaixo.</p>
        <pre style="white-space:pre-wrap;word-break:break-word;background:#151512;border:1px solid #302f29;border-radius:9px;padding:13px;color:#e4b86a;font-size:12px;margin:0">${detail.replace(/[&<>"']/g, (value) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[value] || value)}</pre>
      </section>
    </main>`;
}

window.addEventListener("error", (event) => renderFatalError(event.error || event.message));
window.addEventListener("unhandledrejection", (event) => renderFatalError(event.reason));

async function bootstrap() {
  try {
    await import("./monaco");
    const { default: App } = await import("./App");
    const root = document.getElementById("root");
    if (!root) throw new Error("Elemento principal da interface não foi encontrado.");
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  } catch (error) {
    renderFatalError(error);
  }
}

void bootstrap();
