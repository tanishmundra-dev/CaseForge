const supabase = require("./supabase");

async function seed() {
  console.log("Seeding database...");

  // Clear existing data (order matters for FK constraints)
  await supabase.from("submissions").delete().neq("id", "");
  await supabase.from("assignments").delete().neq("id", "");
  await supabase.from("classes").delete().neq("id", "");
  await supabase.from("weeks").delete().neq("id", "");
  await supabase.from("courses").delete().neq("id", "");

  // ── Course ──
  const { error: courseErr } = await supabase.from("courses").insert({
    id: "dockyard",
    title: "Docker & Kubernetes Mastery",
    description:
      "A premium, outcome-focused Docker and Kubernetes course for Python developers transitioning to DevOps/Cloud engineering roles.",
    difficulty: "Intermediate to Advanced",
    status: "published",
  });
  if (courseErr) {
    console.error("Course insert error:", courseErr);
    return;
  }

  // ── Weeks ──
  const weeks = [
    { id: "w1", number: 1, title: "Docker Fundamentals", course_id: "dockyard" },
    { id: "w2", number: 2, title: "Real-World Docker", course_id: "dockyard" },
    { id: "w3", number: 3, title: "Docker in Production", course_id: "dockyard" },
    { id: "w4", number: 4, title: "Kubernetes Fundamentals", course_id: "dockyard" },
  ];
  const { error: weekErr } = await supabase.from("weeks").insert(weeks);
  if (weekErr) {
    console.error("Week insert error:", weekErr);
    return;
  }

  // ── Classes ──
  const classes = [
    { id: "c1", number: 1, title: "Containers: The Why and the What", description: "Run your first container before you understand what it is. Then understand it.", week_id: "w1" },
    { id: "c2", number: 2, title: "Building Images: Dockerfile Mastery", description: "Stop pulling other people's images. Build your own.", week_id: "w1" },
    { id: "c3", number: 3, title: "Running Containers in Practice", description: "Volumes, environment variables, port binding, and the lifecycle you need to know.", week_id: "w2" },
    { id: "c4", number: 4, title: "Docker Compose: Multi-Container Apps", description: "Your app is never just one container. Compose is how real stacks run locally.", week_id: "w2" },
    { id: "c5", number: 5, title: "Docker Networking Deep Dive", description: "Containers live in their own network world. Know how traffic actually flows.", week_id: "w3" },
    { id: "c6", number: 6, title: "Debugging, Optimization, and Production Patterns", description: "Things break in production. Know how to find the problem in 5 minutes.", week_id: "w3" },
    { id: "c7", number: 7, title: "Why Kubernetes: From Docker to Orchestration", description: "One container is easy. A hundred containers need a brain. Kubernetes is that brain.", week_id: "w4" },
    { id: "c8", number: 8, title: "Deployments, Services, and Scaling", description: "Pods die. Deployments make sure new ones are born. Services make sure traffic finds them.", week_id: "w4" },
  ];
  const { error: classErr } = await supabase.from("classes").insert(classes);
  if (classErr) {
    console.error("Class insert error:", classErr);
    return;
  }

  // ── Assignments ──
  const assignments = [
    {
      id: "a1-1",
      title: "Hello Container",
      description: "Write a Python script that prints system information (hostname, OS, Python version), then containerize it with a minimal Dockerfile. The container should print the info and exit cleanly.",
      difficulty: "Beginner",
      hints: ["Use `platform` module for system info", "python:3.11-slim is a good base image"],
      pitfalls: ["Using python:latest adds 900MB — always use slim or alpine"],
      aha_moment: "The hostname inside the container is NOT your machine's hostname — that's isolation in action",
      starter_code: 'import platform\nimport socket\n\ndef get_system_info():\n    """Return a dict of system information."""\n    # TODO: Return hostname, os, python_version\n    pass\n\nif __name__ == "__main__":\n    info = get_system_info()\n    for key, value in info.items():\n        print(f"{key}: {value}")',
      test_cases: [
        { input: "", expected_output: "hostname:", description: "Should print hostname" },
        { input: "", expected_output: "python_version:", description: "Should print Python version" },
      ],
      rubric: [
        { criterion: "Correctness", excellent: "All 3 fields printed correctly", acceptable: "2 of 3 fields work", poor: "Script errors or missing output", weight: 40 },
        { criterion: "Code Quality", excellent: "Clean, uses proper modules", acceptable: "Works but hacky", poor: "Incomplete", weight: 30 },
        { criterion: "Container Awareness", excellent: "Shows understanding of isolation", acceptable: "Basic awareness", poor: "No mention of containers", weight: 30 },
      ],
      class_id: "c1",
    },
    {
      id: "a1-2",
      title: "Process Isolation Explorer",
      description: "Write a script that demonstrates container process isolation by listing running processes and comparing PID 1 behavior inside vs outside a container.",
      difficulty: "Beginner",
      hints: ["Use `os.getpid()` and `subprocess` to list processes"],
      pitfalls: ["In a container, PID 1 is YOUR process — if it dies, the container dies"],
      aha_moment: "Containers don't run a full OS — there's no init system, no systemd. Your process IS the system.",
      starter_code: 'import os\nimport subprocess\n\ndef explore_processes():\n    """Show current PID and list visible processes."""\n    my_pid = os.getpid()\n    print(f"My PID: {my_pid}")\n    # TODO: List all visible processes\n    # TODO: Check if we are PID 1\n    pass\n\nif __name__ == "__main__":\n    explore_processes()',
      test_cases: [{ input: "", expected_output: "My PID:", description: "Should print current PID" }],
      rubric: [
        { criterion: "Process Listing", excellent: "Lists processes with explanation", acceptable: "Lists PIDs only", poor: "Doesn't list processes", weight: 50 },
        { criterion: "PID 1 Detection", excellent: "Correctly detects container context", acceptable: "Checks PID but no logic", poor: "Missing", weight: 50 },
      ],
      class_id: "c1",
    },
    {
      id: "a2-1",
      title: "Multi-stage Flask App",
      description: "Build a Flask health-check API with a multi-stage Dockerfile. Stage 1 installs dependencies, Stage 2 copies only what's needed. The final image should be under 100MB.",
      difficulty: "Intermediate",
      hints: ["First stage: install requirements with pip", "Second stage: copy installed packages from first stage", "Use --from=builder to reference the first stage"],
      pitfalls: ["Copying the entire virtualenv instead of site-packages breaks paths", "Forgetting to expose the port means docker run -p won't work"],
      aha_moment: "Multi-stage builds let you use heavy build tools without shipping them — your prod image stays tiny",
      starter_code: 'from flask import Flask, jsonify\nimport datetime\n\napp = Flask(__name__)\n\n@app.route("/health")\ndef health():\n    # TODO: Return JSON with status, timestamp, and version\n    pass\n\nif __name__ == "__main__":\n    app.run(host="0.0.0.0", port=5000)',
      test_cases: [{ input: "", expected_output: '"status"', description: "Health endpoint returns status field" }],
      rubric: [
        { criterion: "API Correctness", excellent: "Returns proper JSON with all fields", acceptable: "Returns JSON but missing fields", poor: "Endpoint errors", weight: 30 },
        { criterion: "Dockerfile Quality", excellent: "Multi-stage, slim image, proper EXPOSE", acceptable: "Single stage but works", poor: "Missing or broken Dockerfile", weight: 40 },
        { criterion: "Image Size Awareness", excellent: "Under 100MB with explanation", acceptable: "Under 200MB", poor: "Over 500MB or not measured", weight: 30 },
      ],
      class_id: "c2",
    },
    {
      id: "a3-1",
      title: "Config-Driven App",
      description: "Build a Python app that reads ALL its configuration from environment variables (DB_HOST, DB_PORT, APP_MODE). It should print the config on startup and fail gracefully if required vars are missing.",
      difficulty: "Intermediate",
      hints: ["Use os.environ.get() with defaults for optional vars", "Raise clear errors for required vars"],
      pitfalls: ["Hardcoding defaults for required vars defeats the purpose of external config"],
      aha_moment: "The Twelve-Factor App says: config lives in the environment, not in code. Containers make this natural.",
      starter_code: 'import os\nimport sys\n\nREQUIRED_VARS = ["DB_HOST", "DB_PORT"]\nOPTIONAL_VARS = {"APP_MODE": "development", "LOG_LEVEL": "info"}\n\ndef load_config():\n    """Load config from environment variables."""\n    config = {}\n    # TODO: Load required vars, exit if missing\n    # TODO: Load optional vars with defaults\n    return config\n\nif __name__ == "__main__":\n    config = load_config()\n    for key, value in sorted(config.items()):\n        print(f"{key}={value}")',
      test_cases: [{ input: "DB_HOST=localhost DB_PORT=5432", expected_output: "DB_HOST=localhost", description: "Prints loaded config" }],
      rubric: [
        { criterion: "Config Loading", excellent: "Handles required/optional correctly with clear errors", acceptable: "Loads vars but no validation", poor: "Hardcoded values", weight: 50 },
        { criterion: "Error Handling", excellent: "Clear error messages for missing vars", acceptable: "Exits but unclear", poor: "No validation", weight: 30 },
        { criterion: "Code Quality", excellent: "Clean, documented", acceptable: "Works but messy", poor: "Incomplete", weight: 20 },
      ],
      class_id: "c3",
    },
    {
      id: "a4-1",
      title: "Web + Redis Counter",
      description: "Build a Flask app with a Redis-backed visit counter. Write a docker-compose.yml that runs both services. Hitting /count should increment and return the visit count.",
      difficulty: "Intermediate",
      hints: ["Use `redis` Python package to connect", "In Compose, service names ARE hostnames — use `redis` not `localhost`"],
      pitfalls: ["Using localhost instead of the service name — containers have their own network", "Not adding depends_on means Redis might not be ready when Flask starts"],
      aha_moment: "Compose networking is magic — each service name resolves to the right container IP automatically. No hardcoded IPs.",
      starter_code: 'from flask import Flask\nimport redis\nimport os\n\napp = Flask(__name__)\n\n# TODO: Connect to Redis (hint: host should be service name)\n\n@app.route("/count")\ndef count():\n    # TODO: Increment counter in Redis, return the count\n    pass\n\n@app.route("/health")\ndef health():\n    return {"status": "ok"}\n\nif __name__ == "__main__":\n    app.run(host="0.0.0.0", port=5000)',
      test_cases: [{ input: "", expected_output: "count", description: "Should reference a counter" }],
      rubric: [
        { criterion: "Redis Integration", excellent: "Proper connection with error handling", acceptable: "Connects but no retry/error handling", poor: "Missing Redis connection", weight: 35 },
        { criterion: "Counter Logic", excellent: "Atomic increment, returns JSON", acceptable: "Works but race conditions possible", poor: "Not implemented", weight: 35 },
        { criterion: "Compose Awareness", excellent: "Correct service naming and networking", acceptable: "Basic compose file", poor: "Missing or broken compose", weight: 30 },
      ],
      class_id: "c4",
    },
    {
      id: "a5-1",
      title: "Network Inspector",
      description: "Write a Python script that inspects the container's network configuration: IP address, gateway, DNS servers, and reachable hosts. This teaches you what containers see from the inside.",
      difficulty: "Intermediate",
      hints: ["Use `socket` and `subprocess` modules", "Try resolving other service names"],
      pitfalls: ["Assuming containers share the host network — they don't by default"],
      aha_moment: "Each container gets its own IP in a virtual network. Docker DNS resolves service names to these IPs.",
      starter_code: 'import socket\nimport subprocess\n\ndef inspect_network():\n    """Print network configuration visible from inside this container."""\n    hostname = socket.gethostname()\n    ip_addr = socket.gethostbyname(hostname)\n    print(f"Hostname: {hostname}")\n    print(f"IP Address: {ip_addr}")\n    # TODO: Print gateway, DNS servers\n    # TODO: Try resolving common service names\n\nif __name__ == "__main__":\n    inspect_network()',
      test_cases: [
        { input: "", expected_output: "Hostname:", description: "Should print hostname" },
        { input: "", expected_output: "IP Address:", description: "Should print IP" },
      ],
      rubric: [
        { criterion: "Network Discovery", excellent: "Finds IP, gateway, DNS", acceptable: "Finds IP only", poor: "Errors out", weight: 50 },
        { criterion: "Service Resolution", excellent: "Attempts to resolve service names", acceptable: "Basic hostname resolution", poor: "No resolution logic", weight: 30 },
        { criterion: "Code Quality", excellent: "Clean output, well-structured", acceptable: "Works but messy", poor: "Incomplete", weight: 20 },
      ],
      class_id: "c5",
    },
    {
      id: "a6-1",
      title: "Health Check System",
      description: "Build a comprehensive health check system that monitors: memory usage, disk space, CPU load, and external service connectivity. Return a structured JSON report with status for each check.",
      difficulty: "Advanced",
      hints: ["Use `psutil` for system metrics (or `/proc` files in Linux)", "Define thresholds: healthy/warning/critical for each metric"],
      pitfalls: ["Checking only one metric — a healthy CPU doesn't mean healthy disk", "Not setting timeouts on external service checks"],
      aha_moment: "Production health checks aren't boolean — they're graduated. 'Degraded' is just as important as 'down'.",
      starter_code: 'import os\nimport sys\nimport json\n\ndef check_memory():\n    """Check memory usage. Return status and details."""\n    # TODO: Implement\n    pass\n\ndef check_disk():\n    """Check disk space. Return status and details."""\n    # TODO: Implement\n    pass\n\ndef full_health_check():\n    """Run all checks, return aggregate report."""\n    checks = {\n        "memory": check_memory(),\n        "disk": check_disk(),\n    }\n    # TODO: Determine overall status\n    return checks\n\nif __name__ == "__main__":\n    report = full_health_check()\n    print(json.dumps(report, indent=2))',
      test_cases: [
        { input: "", expected_output: '"memory"', description: "Should include memory check" },
        { input: "", expected_output: '"disk"', description: "Should include disk check" },
      ],
      rubric: [
        { criterion: "Check Coverage", excellent: "Memory, disk, CPU, connectivity", acceptable: "2-3 checks", poor: "1 or no checks", weight: 35 },
        { criterion: "Status Levels", excellent: "Healthy/warning/critical with thresholds", acceptable: "Binary pass/fail", poor: "No status logic", weight: 35 },
        { criterion: "Output Format", excellent: "Clean JSON, structured report", acceptable: "Some structure", poor: "Raw text or errors", weight: 30 },
      ],
      class_id: "c6",
    },
    {
      id: "a7-1",
      title: "Pod Manifest Generator",
      description: "Write a Python script that generates valid Kubernetes Pod YAML manifests. Given a container image, name, and port, output a properly structured Pod spec. Bonus: add resource limits and liveness probes.",
      difficulty: "Intermediate",
      hints: ["Use PyYAML to generate valid YAML", "K8s resources follow: apiVersion, kind, metadata, spec"],
      pitfalls: ["Forgetting apiVersion or kind — K8s rejects manifests without them", "Setting memory limits too low causes OOM kills with no clear error"],
      aha_moment: "K8s manifests are declarative — you describe WHAT you want, not HOW to get there. K8s figures out the how.",
      starter_code: 'import yaml\nimport json\n\ndef generate_pod_manifest(name: str, image: str, port: int) -> dict:\n    """Generate a Kubernetes Pod manifest.\n    \n    Args:\n        name: Pod name\n        image: Container image\n        port: Container port\n    Returns:\n        dict: Valid K8s Pod manifest\n    """\n    # TODO: Build the manifest dict\n    manifest = {}\n    return manifest\n\nif __name__ == "__main__":\n    pod = generate_pod_manifest("my-app", "nginx:latest", 80)\n    print(yaml.dump(pod, default_flow_style=False))',
      test_cases: [
        { input: "", expected_output: "apiVersion", description: "Should include apiVersion" },
        { input: "", expected_output: "kind: Pod", description: "Should be kind Pod" },
      ],
      rubric: [
        { criterion: "Manifest Structure", excellent: "Valid K8s spec with all required fields", acceptable: "Has basic structure but missing fields", poor: "Invalid YAML or structure", weight: 40 },
        { criterion: "Resource Limits", excellent: "CPU/memory limits and requests set", acceptable: "One of limits/requests", poor: "No resource management", weight: 30 },
        { criterion: "Code Quality", excellent: "Clean, reusable function", acceptable: "Works but not reusable", poor: "Hardcoded or incomplete", weight: 30 },
      ],
      class_id: "c7",
    },
    {
      id: "a8-1",
      title: "Deployment Manifest Generator",
      description: "Extend the Pod generator to create Deployment and Service manifests. The Deployment should support replicas, rolling updates, and proper labels. The Service should expose the Deployment via ClusterIP.",
      difficulty: "Advanced",
      hints: ["Deployments wrap Pods in a template with replica management", "Labels connect Deployments to Services via selectors", "Rolling update strategy: maxSurge=1, maxUnavailable=0 for zero-downtime"],
      pitfalls: ["Mismatched labels between Deployment and Service — traffic goes nowhere", "Not setting rolling update strategy means K8s kills old pods before new ones are ready"],
      aha_moment: "The label selector is the ONLY thing connecting a Service to its Pods. No labels, no traffic. It's that simple and that critical.",
      starter_code: 'import yaml\n\ndef generate_deployment(name: str, image: str, port: int, replicas: int = 3) -> dict:\n    """Generate a Kubernetes Deployment manifest."""\n    # TODO: Build Deployment with rolling update strategy\n    pass\n\ndef generate_service(name: str, port: int, target_port: int) -> dict:\n    """Generate a Kubernetes Service manifest."""\n    # TODO: Build ClusterIP Service with matching selectors\n    pass\n\nif __name__ == "__main__":\n    deploy = generate_deployment("web-app", "myapp:v1", 8080, replicas=3)\n    svc = generate_service("web-app", 80, 8080)\n    print("---")\n    print(yaml.dump(deploy, default_flow_style=False))\n    print("---")\n    print(yaml.dump(svc, default_flow_style=False))',
      test_cases: [
        { input: "", expected_output: "kind: Deployment", description: "Should generate Deployment" },
        { input: "", expected_output: "kind: Service", description: "Should generate Service" },
        { input: "", expected_output: "replicas", description: "Should include replicas" },
      ],
      rubric: [
        { criterion: "Deployment Spec", excellent: "Replicas, rolling update, resource limits, labels", acceptable: "Basic deployment works", poor: "Invalid or incomplete manifest", weight: 35 },
        { criterion: "Service Spec", excellent: "Correct selectors, port mapping, ClusterIP", acceptable: "Basic service", poor: "Missing or broken", weight: 35 },
        { criterion: "Label Consistency", excellent: "Labels match across Deployment, Pod template, and Service", acceptable: "Mostly consistent", poor: "Mismatched labels", weight: 30 },
      ],
      class_id: "c8",
    },
  ];

  const { error: assignErr } = await supabase.from("assignments").insert(assignments);
  if (assignErr) {
    console.error("Assignment insert error:", assignErr);
    return;
  }

  // ── Seed submissions for analytics ──
  const names = ["Arjun Mehta", "Priya Sharma", "Rahul Kumar", "Sneha Patel", "Vikram Singh", "Ananya Reddy", "Karthik Nair", "Divya Joshi"];
  const scores = [92, 85, 78, 73, 68, 61, 55, 45];
  const grades = ["A", "A-", "B+", "B", "C+", "C", "C-", "D"];

  const submissions = names.map((name, i) => {
    const score = scores[i];
    const d = new Date();
    d.setDate(d.getDate() - (7 - i));

    return {
      id: `sub-${String(i + 1).padStart(3, "0")}`,
      course_id: "dockyard",
      class_id: "c1",
      assignment_id: "a1-1",
      trainee_name: name,
      code: "# submitted",
      execution_output: "hostname: container-abc\nos: Linux\npython_version: 3.11.4",
      overall_score: score,
      grade: grades[i],
      criterion_scores: [
        { criterion: "Correctness", score: Math.min(score + 3, 100), level: score > 80 ? "Excellent" : score > 60 ? "Acceptable" : "Poor", feedback: score > 70 ? "Good" : "Needs work" },
        { criterion: "Code Quality", score: Math.max(score - 2, 0), level: score > 80 ? "Excellent" : score > 60 ? "Acceptable" : "Poor", feedback: score > 70 ? "Solid" : "Incomplete" },
        { criterion: "Container Awareness", score: Math.min(score + 1, 100), level: score > 80 ? "Excellent" : score > 60 ? "Acceptable" : "Poor", feedback: score > 70 ? "Strong" : "Weak" },
      ],
      overall_feedback: `${score > 75 ? "Strong submission" : score > 60 ? "Average" : "Needs improvement"}.`,
      strengths: ["Good core understanding"],
      improvements: ["Error handling"],
      submitted_at: d.toISOString(),
    };
  });

  const { error: subErr } = await supabase.from("submissions").insert(submissions);
  if (subErr) {
    console.error("Submission insert error:", subErr);
    return;
  }

  console.log("Seeding complete!");
}

seed();
