import sys
import json

def main():
    try:
        input_data = json.load(sys.stdin)
    except Exception:
        print(json.dumps({"decision": "ask", "reason": "Hook failed to parse input"}))
        return
        
    tool_call = input_data.get("toolCall", {})
    tool_name = tool_call.get("name", "")
    args = tool_call.get("args", {})
    
    if tool_name == "run_command":
        cmd = args.get("CommandLine", "").lower()
        dangerous_keywords = ["rm ", "del ", "format ", "sudo ", "drop ", "truncate", "kill ", "shutdown", "chmod"]
        
        if any(keyword in cmd for keyword in dangerous_keywords) or "pip install" in cmd or "npm install -g" in cmd:
            print(json.dumps({
                "decision": "ask",
                "reason": f"Intercepted restricted command '{cmd}'. Asking for manual approval."
            }))
        else:
            print(json.dumps({
                "decision": "allow",
                "reason": "Command looks harmless and was auto-approved by the keyword heuristic."
            }))
    else:
        print(json.dumps({"decision": "allow", "reason": "Non-destructive tool auto-approved."}))

if __name__ == "__main__":
    main()
