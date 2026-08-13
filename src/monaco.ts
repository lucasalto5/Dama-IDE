import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "./workers/editor.worker?worker";
import JsonWorker from "./workers/json.worker?worker";
import CssWorker from "./workers/css.worker?worker";
import HtmlWorker from "./workers/html.worker?worker";
import TsWorker from "./workers/typescript.worker?worker";

type MonacoScope = typeof globalThis & {
  MonacoEnvironment?: { getWorker: (_moduleId: string, label: string) => Worker };
};

(self as MonacoScope).MonacoEnvironment = {
  getWorker(_moduleId, label) {
    if (label === "json") return new JsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new CssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new HtmlWorker();
    if (label === "typescript" || label === "javascript") return new TsWorker();
    return new EditorWorker();
  },
};

loader.config({ monaco });
