import os
import json
import sys
import subprocess
import server
from aiohttp import web


WEB_DIRECTORY = "./web"

NODE_DIR = os.path.dirname(os.path.abspath(__file__))
SECRETS_FILE = os.path.join(NODE_DIR, "secrets.json")

secrets = {
    "OPEN_AI": "hello"
}

with open(SECRETS_FILE, "a+") as f:
    f.seek(0)
    data = f.read()
    if data == "":
        json.dump(secrets, f, indent=2)
    f.seek(0)
    secrets = json.load(f)

class GetSecret:

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "Secret": ("STRING", ),
            }
        }

    @classmethod
    def IS_CHANGED(cls, Secret):
        with open(SECRETS_FILE) as f:
            return json.load(f).get(Secret, "")

    RETURN_TYPES = ("*",)
    FUNCTION = "passtring"
    CATEGORY = "secrets/secrets"
    SEARCH_ALIASES = ["text", "value"]

    def passtring(self, Secret):
        with open(SECRETS_FILE) as f:
            data = json.load(f)
        if Secret not in data:
            raise KeyError(f"Secret '{Secret}' not found in secrets.json")
        return (data[Secret], )


async def get_secrets(arg):
    return web.json_response(secrets)


async def set_secret(request):
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid or empty request body"}, status=400)
    key = data.get("key", "").strip()
    value = data.get("value", "")
    if not key:
        return web.json_response({"error": "Key cannot be empty"}, status=400)
    secrets[key] = value
    with open(SECRETS_FILE, "w") as f:
        json.dump(secrets, f, indent=2)
    return web.json_response({"ok": True})


async def delete_secret(request):
    key = request.match_info["key"]
    if key not in secrets:
        return web.json_response({"error": "Key not found"}, status=404)
    del secrets[key]
    with open(SECRETS_FILE, "w") as f:
        json.dump(secrets, f, indent=2)
    return web.json_response({"ok": True})

# bugfix for hot reload. Register routes.
if not getattr(server.PromptServer.instance, "_comfyui_secrets_registered", False):
    server.PromptServer.instance.routes.get("/comfyui-secrets")(get_secrets)
    server.PromptServer.instance.routes.post("/comfyui-secrets")(set_secret)
    server.PromptServer.instance.routes.delete("/comfyui-secrets/{key}")(delete_secret)
    server.PromptServer.instance._comfyui_secrets_registered = True


NODE_CLASS_MAPPINGS = {
    "Get Secret": GetSecret
}
