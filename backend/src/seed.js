const supabase = require("./supabase");

async function seed() {
  console.log("Seeding database with rich course content...");

  // Clear existing data
  await supabase.from("submissions").delete().neq("id", "");
  await supabase.from("assignments").delete().neq("id", "");
  await supabase.from("classes").delete().neq("id", "");
  await supabase.from("weeks").delete().neq("id", "");
  await supabase.from("courses").delete().neq("id", "");

  // ── Course ──
  const { error: ce } = await supabase.from("courses").insert({
    id: "dockyard",
    title: "Docker & Kubernetes Mastery",
    description: "A premium, outcome-focused Docker and Kubernetes course for developers transitioning to DevOps/Cloud engineering roles. Covers containers, images, networking, Compose, and K8s fundamentals.",
    difficulty: "Intermediate to Advanced",
    status: "published",
  });
  if (ce) { console.error("Course error:", ce.message); return; }

  // ── Week 1 ──
  await insertWeek("dockyard", "w1", 1, "Docker Fundamentals", [
    {
      id: "c1", number: 1, title: "Containers: The Why and the What",
      description: "Run your first container before you understand what it is. Then understand it.\n\nContainers are lightweight, isolated environments that package an application and all its dependencies together. Unlike virtual machines, containers share the host OS kernel, making them faster to start and more efficient with resources.\n\nIn this class, you'll learn:\n- What containers are and why they matter\n- The difference between containers and VMs\n- How Docker uses Linux namespaces and cgroups for isolation\n- The container lifecycle: create, start, stop, remove\n- How to run your first container with `docker run`",
      assignments: [
        {
          id: "a1-1", title: "Hello Container", type: "coding", difficulty: "Beginner",
          description: "Write a Python script that prints system information (hostname, OS, Python version), then containerize it with a minimal Dockerfile.",
          starter_code: 'import platform\nimport socket\n\ndef get_system_info():\n    """Return a dict of system information."""\n    return {\n        "hostname": socket.gethostname(),\n        "os": platform.system(),\n        "python_version": platform.python_version()\n    }\n\nif __name__ == "__main__":\n    info = get_system_info()\n    for key, value in info.items():\n        print(f"{key}: {value}")',
          test_cases: [
            { input: "", expected_output: "hostname:", description: "Should print hostname" },
            { input: "", expected_output: "python_version:", description: "Should print Python version" },
          ],
          rubric: [
            { criterion: "Correctness", excellent: "All 3 fields printed correctly", acceptable: "2 of 3 fields work", poor: "Script errors", weight: 40 },
            { criterion: "Code Quality", excellent: "Clean, uses proper modules", acceptable: "Works but hacky", poor: "Incomplete", weight: 30 },
            { criterion: "Container Awareness", excellent: "Shows understanding of isolation", acceptable: "Basic awareness", poor: "No mention", weight: 30 },
          ],
          hints: ["Use `platform` module for system info", "python:3.11-slim is a good base image"],
          pitfalls: ["Using python:latest adds 900MB — always use slim or alpine"],
          aha_moment: "The hostname inside the container is NOT your machine's hostname — that's isolation in action",
        },
        {
          id: "a1-2", title: "Container Basics Quiz", type: "objective", difficulty: "Beginner",
          description: "Test your understanding of container fundamentals.",
          questions: [
            { type: "mcq", question: "What is the main difference between a container and a virtual machine?", options: ["Containers have their own OS kernel", "Containers share the host OS kernel", "Containers are slower than VMs", "Containers can only run Linux"], correct: 1, explanation: "Containers share the host OS kernel, making them lightweight and fast to start." },
            { type: "mcq", question: "What command runs a container from an image?", options: ["docker build", "docker run", "docker start", "docker create"], correct: 1, explanation: "docker run creates and starts a container from an image in one step." },
            { type: "mcq", question: "What happens when PID 1 in a container exits?", options: ["Nothing", "The container restarts", "The container stops", "The host crashes"], correct: 2, explanation: "When PID 1 exits, the container stops. Your process IS the container." },
            { type: "fill_up", question: "Docker uses Linux ___ and cgroups to provide container isolation.", answer: "namespaces", explanation: "Namespaces provide isolation of system resources like PIDs, network, and filesystems." },
            { type: "mcq", question: "Which base image is recommended for production Python containers?", options: ["python:latest", "python:3.11-slim", "ubuntu:latest", "alpine:latest"], correct: 1, explanation: "python:3.11-slim provides a minimal Python environment at ~150MB vs ~900MB for full." },
            { type: "fill_up", question: "The docker ___ command shows all running containers.", answer: "ps", explanation: "docker ps lists running containers. Add -a flag to see stopped containers too." },
          ],
        },
      ],
      references: [
        { title: "Docker Get Started", url: "https://docs.docker.com/get-started/", description: "Official Docker tutorial for beginners" },
        { title: "What is a Container?", url: "https://www.docker.com/resources/what-container/", description: "Docker's explanation of container technology" },
      ],
    },
    {
      id: "c2", number: 2, title: "Building Images: Dockerfile Mastery",
      description: "Stop pulling other people's images. Build your own.\n\nA Dockerfile is a text file with instructions for building a Docker image. Each instruction creates a layer in the image. Understanding layers, caching, and multi-stage builds is essential for creating efficient production images.\n\nTopics covered:\n- Dockerfile syntax and best practices\n- Understanding image layers and caching\n- Multi-stage builds for minimal production images\n- COPY vs ADD, RUN best practices\n- .dockerignore and reducing build context",
      assignments: [
        {
          id: "a2-1", title: "Multi-stage Flask App", type: "ide", difficulty: "Intermediate",
          description: "Build a Flask health-check API with a multi-stage Dockerfile. Stage 1 installs dependencies, Stage 2 copies only what's needed. The final image should be under 100MB.",
          files: [
            { name: "app.py", content: 'from flask import Flask, jsonify\nimport datetime\n\napp = Flask(__name__)\n\n@app.route("/health")\ndef health():\n    return jsonify({\n        "status": "healthy",\n        "timestamp": datetime.datetime.now().isoformat(),\n        "version": "1.0.0"\n    })\n\nif __name__ == "__main__":\n    app.run(host="0.0.0.0", port=5000)', language: "python" },
            { name: "Dockerfile", content: '# Stage 1: Build\nFROM python:3.11-slim AS builder\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\n\n# Stage 2: Production\nFROM python:3.11-slim\nWORKDIR /app\nCOPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages\nCOPY app.py .\nEXPOSE 5000\nCMD ["python", "app.py"]', language: "dockerfile" },
            { name: "requirements.txt", content: "flask==3.0.0", language: "plaintext" },
          ],
          test_cases: [{ input: "GET /health", expected_output: '{"status": "healthy"}', description: "Health endpoint returns status" }],
          rubric: [
            { criterion: "API Correctness", excellent: "Returns proper JSON with all fields", acceptable: "Returns JSON but missing fields", poor: "Endpoint errors", weight: 30 },
            { criterion: "Dockerfile Quality", excellent: "Multi-stage, slim image, proper EXPOSE", acceptable: "Single stage but works", poor: "Missing or broken", weight: 40 },
            { criterion: "Image Size", excellent: "Under 100MB with explanation", acceptable: "Under 200MB", poor: "Over 500MB", weight: 30 },
          ],
          hints: ["Use --from=builder to copy from the first stage", "Only copy site-packages, not the entire virtualenv"],
          pitfalls: ["Copying the entire virtualenv breaks paths", "Forgetting EXPOSE means docker run -p won't work"],
          aha_moment: "Multi-stage builds let you use heavy build tools without shipping them — your prod image stays tiny",
        },
      ],
      references: [
        { title: "Dockerfile Reference", url: "https://docs.docker.com/reference/dockerfile/", description: "Complete Dockerfile instruction reference" },
        { title: "Multi-stage Builds", url: "https://docs.docker.com/build/building/multi-stage/", description: "Official guide to multi-stage Docker builds" },
      ],
    },
  ]);

  // ── Week 2 ──
  await insertWeek("dockyard", "w2", 2, "Real-World Docker", [
    {
      id: "c3", number: 3, title: "Docker Compose: Multi-Container Apps",
      description: "Your app is never just one container. Compose is how real stacks run locally.\n\nDocker Compose lets you define and run multi-container applications. Using a YAML file, you configure services, networks, and volumes. Then with a single command, you create and start all services.\n\nKey concepts:\n- docker-compose.yml structure\n- Service definitions and dependencies\n- Networking between containers\n- Volume mounts for persistence\n- Environment variables and .env files",
      assignments: [
        {
          id: "a3-1", title: "Web + Redis Counter", type: "coding", difficulty: "Intermediate",
          description: "Build a Flask app with a Redis-backed visit counter. Write a docker-compose.yml that runs both services. Hitting /count should increment and return the visit count.",
          starter_code: 'from flask import Flask\nimport redis\nimport os\n\napp = Flask(__name__)\nr = redis.Redis(host=os.getenv("REDIS_HOST", "redis"), port=6379)\n\n@app.route("/count")\ndef count():\n    visits = r.incr("visits")\n    return {"count": visits}\n\n@app.route("/health")\ndef health():\n    return {"status": "ok"}\n\nif __name__ == "__main__":\n    app.run(host="0.0.0.0", port=5000)',
          test_cases: [{ input: "GET /count", expected_output: "count", description: "Should return visit count" }],
          rubric: [
            { criterion: "Redis Integration", excellent: "Proper connection with error handling", acceptable: "Connects but no error handling", poor: "Missing Redis", weight: 35 },
            { criterion: "Counter Logic", excellent: "Atomic increment, returns JSON", acceptable: "Works but race conditions", poor: "Not implemented", weight: 35 },
            { criterion: "Compose File", excellent: "Correct service naming and networking", acceptable: "Basic compose", poor: "Missing or broken", weight: 30 },
          ],
          hints: ["In Compose, service names ARE hostnames — use `redis` not `localhost`", "Use depends_on to control startup order"],
          pitfalls: ["Using localhost instead of service name", "Not adding depends_on means Redis might not be ready"],
          aha_moment: "Compose networking is magic — each service name resolves to the right container IP automatically.",
        },
        {
          id: "a3-2", title: "Docker Compose Quiz", type: "objective", difficulty: "Intermediate",
          description: "Test your Docker Compose knowledge.",
          questions: [
            { type: "mcq", question: "In Docker Compose, how do containers in the same network communicate?", options: ["By IP address only", "By service name as hostname", "Through a shared volume", "They can't communicate"], correct: 1, explanation: "Compose creates a default network where service names resolve to container IPs." },
            { type: "fill_up", question: "The command to start all services defined in docker-compose.yml is docker compose ___.", answer: "up", explanation: "docker compose up creates and starts all services. Add -d for detached mode." },
            { type: "mcq", question: "What does depends_on do in Docker Compose?", options: ["Makes one service wait for another to be healthy", "Controls startup order only", "Shares environment variables", "Links container networks"], correct: 1, explanation: "depends_on controls startup order but doesn't wait for the service to be ready — use healthchecks for that." },
            { type: "mcq", question: "Which keyword defines persistent storage in docker-compose.yml?", options: ["storage", "volumes", "mounts", "drives"], correct: 1, explanation: "volumes: defines persistent storage that survives container restarts." },
            { type: "fill_up", question: "The ___ flag runs Docker Compose services in the background (detached mode).", answer: "-d", explanation: "docker compose up -d starts services in detached mode." },
          ],
        },
      ],
      references: [
        { title: "Docker Compose Documentation", url: "https://docs.docker.com/compose/", description: "Official Compose documentation" },
        { title: "Compose File Reference", url: "https://docs.docker.com/compose/compose-file/", description: "Full YAML reference for docker-compose.yml" },
      ],
    },
    {
      id: "c4", number: 4, title: "Docker Networking & Debugging",
      description: "Containers live in their own network world. Know how traffic flows and how to debug when it doesn't.\n\nDocker networking determines how containers communicate with each other and the outside world. Understanding bridge networks, port mapping, and DNS resolution is critical for production deployments.\n\nTopics:\n- Bridge, host, and overlay networks\n- Port mapping (-p) and EXPOSE\n- Container DNS and service discovery\n- Debugging with docker logs, exec, and inspect\n- Common networking issues and fixes",
      assignments: [
        {
          id: "a4-1", title: "Network Inspector", type: "coding", difficulty: "Intermediate",
          description: "Write a Python script that inspects the container's network: IP address, gateway, DNS servers, and reachable hosts.",
          starter_code: 'import socket\nimport subprocess\n\ndef inspect_network():\n    hostname = socket.gethostname()\n    ip_addr = socket.gethostbyname(hostname)\n    print(f"Hostname: {hostname}")\n    print(f"IP Address: {ip_addr}")\n    \n    # Get default gateway\n    try:\n        result = subprocess.run(["ip", "route"], capture_output=True, text=True)\n        for line in result.stdout.split("\\n"):\n            if "default" in line:\n                print(f"Gateway: {line.split()[2]}")\n    except:\n        print("Gateway: unable to determine")\n    \n    # Try resolving common service names\n    for name in ["redis", "db", "api"]:\n        try:\n            ip = socket.gethostbyname(name)\n            print(f"Service {name}: {ip}")\n        except:\n            print(f"Service {name}: not found")\n\nif __name__ == "__main__":\n    inspect_network()',
          test_cases: [
            { input: "", expected_output: "Hostname:", description: "Should print hostname" },
            { input: "", expected_output: "IP Address:", description: "Should print IP" },
          ],
          rubric: [
            { criterion: "Network Discovery", excellent: "Finds IP, gateway, DNS", acceptable: "IP only", poor: "Errors out", weight: 50 },
            { criterion: "Service Resolution", excellent: "Attempts service name resolution", acceptable: "Basic hostname only", poor: "No resolution", weight: 30 },
            { criterion: "Code Quality", excellent: "Clean, structured output", acceptable: "Works but messy", poor: "Incomplete", weight: 20 },
          ],
          hints: ["Use socket.gethostbyname() for DNS resolution", "subprocess can run system commands like 'ip route'"],
          pitfalls: ["Assuming containers share the host network — they don't by default"],
          aha_moment: "Each container gets its own IP in a virtual network. Docker DNS resolves service names to these IPs.",
        },
      ],
      references: [
        { title: "Docker Networking", url: "https://docs.docker.com/network/", description: "Official Docker networking guide" },
        { title: "Debugging Docker", url: "https://docs.docker.com/engine/daemon/logs/", description: "Docker debugging and logging guide" },
      ],
    },
  ]);

  // ── Seed submissions for analytics ──
  const names = ["Arjun Mehta", "Priya Sharma", "Rahul Kumar", "Sneha Patel", "Vikram Singh", "Ananya Reddy", "Karthik Nair", "Divya Joshi"];
  const scores = [92, 85, 78, 73, 68, 61, 55, 45];
  const grades = ["A", "A-", "B+", "B", "C+", "C", "C-", "D"];

  for (let i = 0; i < names.length; i++) {
    const d = new Date(); d.setDate(d.getDate() - (7 - i));
    await supabase.from("submissions").insert({
      id: `sub-${String(i + 1).padStart(3, "0")}`,
      course_id: "dockyard", class_id: "c1", assignment_id: "a1-1",
      trainee_name: names[i], code: "# submitted",
      execution_output: "hostname: container-abc\nos: Linux\npython_version: 3.11.4",
      overall_score: scores[i], grade: grades[i],
      criterion_scores: [
        { criterion: "Correctness", score: Math.min(scores[i] + 3, 100), level: scores[i] > 80 ? "Excellent" : scores[i] > 60 ? "Acceptable" : "Poor", feedback: scores[i] > 70 ? "Good" : "Needs work" },
        { criterion: "Code Quality", score: Math.max(scores[i] - 2, 0), level: scores[i] > 80 ? "Excellent" : "Acceptable", feedback: scores[i] > 70 ? "Solid" : "Incomplete" },
      ],
      overall_feedback: `${scores[i] > 75 ? "Strong submission" : scores[i] > 60 ? "Average" : "Needs improvement"}.`,
      strengths: ["Good understanding"], improvements: ["Error handling"],
      submitted_at: d.toISOString(),
    });
  }

  console.log("Seeding complete!");
}

async function insertWeek(courseId, weekId, number, title, classes) {
  const { error: we } = await supabase.from("weeks").insert({ id: weekId, number, title, course_id: courseId });
  if (we) { console.error(`Week ${number} error:`, we.message); return; }

  for (const cls of classes) {
    const classRow = { id: cls.id, number: cls.number, title: cls.title, description: cls.description, week_id: weekId };
    // Try with resource_links
    const { error: e1 } = await supabase.from("classes").insert({ ...classRow, resource_links: cls.references || [] });
    if (e1) await supabase.from("classes").insert(classRow); // retry without

    for (const asn of cls.assignments) {
      const { error: ae } = await supabase.from("assignments").insert({
        id: asn.id, title: asn.title, description: asn.description || "",
        difficulty: asn.difficulty || "Intermediate", type: asn.type || "coding",
        hints: asn.hints || [], pitfalls: asn.pitfalls || [],
        aha_moment: asn.aha_moment || "", starter_code: asn.starter_code || "",
        test_cases: asn.test_cases || [], rubric: asn.rubric || [],
        questions: asn.questions || [], files: asn.files || [],
        class_id: cls.id,
      });
      if (ae) console.error(`  Assignment ${asn.id} error:`, ae.message);
      else console.log(`  ${asn.type}: ${asn.title}`);
    }
  }
}

seed();
