import time
import random


def grade_submission(assignment: dict, code: str, exec_result: dict = None) -> dict:
    time.sleep(1.5)

    code_len = len(code.strip())
    has_output = bool(exec_result and exec_result.get("stdout", "").strip())
    has_error = bool(exec_result and exec_result.get("stderr", "").strip())

    # Score heuristic: code length + execution success
    if code_len < 50:
        base_score = random.randint(30, 45)
    elif code_len < 200:
        base_score = random.randint(55, 72)
    else:
        base_score = random.randint(74, 95)

    # Bonus for successful execution
    if has_output and not has_error:
        base_score = min(100, base_score + 5)
    elif has_error:
        base_score = max(0, base_score - 10)

    rubric = assignment.get("rubric", [])
    criterion_scores = []
    for item in rubric:
        variance = random.randint(-8, 8)
        score = max(0, min(100, base_score + variance))
        if score >= 80:
            level = "Excellent"
        elif score >= 60:
            level = "Acceptable"
        else:
            level = "Poor"

        feedback_map = {
            "Excellent": [
                "Strong implementation that demonstrates clear understanding.",
                "Well-executed with attention to edge cases.",
                "Impressive work — goes beyond the basics.",
            ],
            "Acceptable": [
                "Functional but could be more robust.",
                "The core idea is right, but details need polish.",
                "Works for the happy path — consider edge cases.",
            ],
            "Poor": [
                "This section needs significant rework.",
                "Missing key implementation details.",
                "The approach doesn't meet the requirements yet.",
            ],
        }

        criterion_scores.append({
            "criterion": item.get("criterion", "Unknown"),
            "score": score,
            "level": level,
            "feedback": random.choice(feedback_map[level]),
        })

    avg = sum(cs["score"] for cs in criterion_scores) / len(criterion_scores) if criterion_scores else base_score
    overall = round(avg)

    if overall >= 90:
        grade = "A"
    elif overall >= 85:
        grade = "A-"
    elif overall >= 80:
        grade = "B+"
    elif overall >= 75:
        grade = "B"
    elif overall >= 70:
        grade = "B-"
    elif overall >= 65:
        grade = "C+"
    elif overall >= 60:
        grade = "C"
    elif overall >= 50:
        grade = "D"
    else:
        grade = "F"

    strengths_pool = [
        "Good understanding of the core concepts",
        "Clean separation of concerns",
        "Correct use of Python standard library",
        "Solid grasp of container fundamentals",
        "Nice use of error handling in key sections",
    ]
    improvements_pool = [
        "Add error handling for edge cases",
        "Consider container-specific behavior",
        "Add logging for production debugging",
        "Optimize for minimal resource usage",
        "Add input validation and type hints",
    ]

    exec_note = ""
    if exec_result:
        if has_output and not has_error:
            exec_note = " Code executed successfully."
        elif has_error:
            exec_note = f" Code had errors during execution."

    return {
        "overall_score": overall,
        "grade": grade,
        "criterion_scores": criterion_scores,
        "overall_feedback": f"{'Strong submission demonstrating solid understanding.' if overall >= 75 else 'Decent attempt with room for improvement.' if overall >= 60 else 'This submission needs significant work.'}{exec_note} Overall score: {overall}/100.",
        "strengths": random.sample(strengths_pool, k=min(2, len(strengths_pool))),
        "improvements": random.sample(improvements_pool, k=min(2, len(improvements_pool))),
    }


def companion_chat(messages: list, assignment: dict = None, code: str = "") -> dict:
    time.sleep(0.5)

    last_msg = messages[-1]["content"].lower() if messages else ""

    if "docker" in last_msg or "container" in last_msg:
        return {"content": "Good question! Remember that containers are isolated processes — they have their own filesystem, network, and process tree. Think about what that means for your code: environment variables, hostnames, and file paths all change."}
    elif "kubernetes" in last_msg or "k8s" in last_msg or "pod" in last_msg:
        return {"content": "With Kubernetes, think declaratively — you describe the desired state, and K8s makes it happen. The key resources are: Pods (smallest unit), Deployments (manage replicas), and Services (expose Pods to network traffic)."}
    elif "yaml" in last_msg or "manifest" in last_msg:
        return {"content": "Every K8s manifest needs four things: apiVersion, kind, metadata (with name and labels), and spec. Get those right and you're 80% there. Labels are how K8s connects resources to each other."}
    elif "help" in last_msg or "stuck" in last_msg or "start" in last_msg:
        return {"content": "Start with the simplest version that works. Get the basic structure right, run it, then add complexity. The assignments are designed to build on each other — don't skip ahead!"}
    elif "error" in last_msg or "bug" in last_msg or "fix" in last_msg:
        return {"content": "Try running your code first to see the exact error. Common issues: missing imports, wrong variable names, or forgetting to call the function. The error message usually tells you exactly where to look."}
    elif "test" in last_msg or "run" in last_msg:
        return {"content": "Use the Run Code button to execute your solution. Check the output panel for stdout (green) and stderr (red). The test cases show you what output is expected."}
    else:
        return {"content": "That's a great question! Think about the specific problem the assignment is asking you to solve. What's the core logic needed? Start there, and let the hints guide you if you get stuck."}
