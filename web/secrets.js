import { app } from "../../scripts/app.js";
import { api } from '../../scripts/api.js';


const cssUrl = new URL("./secrets.css", import.meta.url);
if (!document.querySelector(`link[href="${cssUrl}"]`)) {
    document.head.appendChild(Object.assign(document.createElement("link"), { rel: "stylesheet", href: cssUrl }));
}

function el(tag, props, ...children) {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
}

async function refreshDropdowns() {
    const resp = await api.fetchApi("/comfyui-secrets", { method: "GET" });
    const data = await resp.json();
    const keys = Object.keys(data);
    for (const node of (app.graph._nodes ?? [])) {
        if (node.comfyClass !== "Get Secret") continue;
        const widget = node.widgets?.find(w => w.name === "Secret");
        if (!widget) continue;
        widget.options.values = keys;
        if (keys.length && !keys.includes(widget.value)) {
            widget.value = keys[0];
        }
    }
}


function buildRow(key = "", value = "", isNew = false) {
    let originalKey = key;
    const keyInput = el("input", { className: "csm-input", placeholder: "Key", value: key });
    const valInput = el("input", { className: "csm-input", placeholder: "Value", value, type: "password" });

    const toggleBtn = el("button", {
        className: "csm-btn csm-toggle-btn",
        textContent: "👁",
        title: "Toggle visibility",
        onclick: () => { valInput.type = valInput.type === "password" ? "text" : "password"; },
    });

    const saveBtn = el("button", { className: "csm-btn csm-save-btn", textContent: isNew ? "Add" : "Save" });
    const delBtn  = el("button", { className: "csm-btn csm-del-btn",  textContent: "🗑", title: "Delete" });
    const row     = el("div",    { className: "csm-row" }, keyInput, valInput, toggleBtn, saveBtn, delBtn);

    saveBtn.onclick = async () => {
        const k = keyInput.value.trim();
        const v = valInput.value;
        if (!k) { keyInput.focus(); return; }
        const resp = await api.fetchApi("/comfyui-secrets", {
            method: "POST",
            body: JSON.stringify({ key: k, value: v }),
        });
        if (!resp.ok) return;
        // If the key was renamed, delete the old one
        if (!isNew && originalKey && originalKey !== k) {
            await api.fetchApi(`/comfyui-secrets/${encodeURIComponent(originalKey)}`, { method: "DELETE" });
            originalKey = k;
        }
        refreshDropdowns();
        if (isNew) {
            row.replaceWith(buildRow(k, v, false));
        } else {
            originalKey = k;
            saveBtn.textContent = "Saved!";
            setTimeout(() => saveBtn.textContent = "Save", 1200);
        }
    };

    delBtn.onclick = async () => {
        if (!originalKey) { row.remove(); return; }
        const resp = await api.fetchApi(`/comfyui-secrets/${encodeURIComponent(originalKey)}`, {
            method: "DELETE",
        });
        if (resp.ok) {
          row.remove();
          refreshDropdowns();
        }
    };

    return row;
}


function createModal(secrets) {
    const rowsContainer = el("div", { className: "csm-rows" },
        ...Object.entries(secrets).map(([k, v]) => buildRow(k, v)),
    );

    const addBtn = el("button", {
        className: "csm-add-btn",
        textContent: "+ Add Secret",
        onclick: () => {
            const newRow = buildRow("", "", true);
            rowsContainer.appendChild(newRow);
            newRow.querySelector("input").focus();
        },
    });

    const closeBtn = el("button", { className: "csm-close-btn", textContent: "✕" });
    const overlay = el("div", { className: "csm-overlay" },
        el("div", { className: "csm-dialog" },
            el("div", { className: "csm-header" },
                el("h3", { className: "csm-title", textContent: "Secrets Manager" }),
                closeBtn,
            ),
            rowsContainer,
            addBtn,
        ),
    );

    closeBtn.onclick = () => overlay.remove();
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

    return overlay;
}


app.registerExtension({
    name: "comfyui.secrets",
    async nodeCreated(node) {
        if (node.comfyClass !== "Get Secret") return;

        // Fetch keys and replace the STRING widget with a combo
        const resp = await api.fetchApi("/comfyui-secrets", { method: "GET" });
        const data = await resp.json();
        const keys = Object.keys(data);

        const idx = node.widgets?.findIndex(w => w.name === "Secret") ?? -1;
        if (idx >= 0) node.widgets.splice(idx, 1);

        node.addWidget("combo", "Secret", keys[0] ?? "", () => {}, { values: keys });

        node.addWidget("button", "Edit Secrets", null, async () => {
            const r = await api.fetchApi("/comfyui-secrets", { method: "GET" });
            const secrets = await r.json();
            document.body.appendChild(createModal(secrets));
        });
    }
});
