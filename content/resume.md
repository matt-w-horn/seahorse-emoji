+++
title = "Resume"
author = "Matt Horn"
+++

**Software & Security Engineer** | Distributed Systems & AI

Sunnyvale, CA · [LinkedIn](https://www.linkedin.com/in/matt-horn-718611197/) · [GitHub](https://github.com/matt-w-horn) · *Also available as a [PDF](/resume.pdf).*

## Profile Summary

- Software and Security Engineer with 12 years of experience building AI
  serving infrastructure, sovereign cloud deployments, and identity data planes
  at Google, OpenAI, AWS, and Twilio.
- Specializes in distributed systems reliability, AI model serving, identity
  and access management, incident response, DoS and denial-of-wallet
  mitigation, and ABAC, using load shedding, deadlines and retries,
  idempotency, and policy as code.
- Broad toolkit covering languages (C++, Python, Java, Lean 4), cloud and
  containers (Google Cloud, AWS, Kubernetes, Terraform), and data stores
  (Spanner, Postgres, DynamoDB, Aurora MySQL).
- Strong cross-functional collaborator, partnering with security, product, and
  hundreds of integrating service teams to unblock launches and resolve issues
  under live incident pressure.
- Technical leader who has run teams of about 6 engineers, served as interim
  manager, and conducted around 100 interviews.

## Technical Skills

- **Languages:** C++, Python, Java, TypeScript, JavaScript, SQL, Lean 4, Apex
- **Distributed Systems:** load shedding, deadlines and retries, idempotency,
  load testing, A/B testing
- **Messaging & Observability:** Kafka, Amazon SQS, Google Cloud Pub/Sub,
  Datadog, Sentry, black-box monitoring (probers)
- **Reliability:** incident response, postmortems, dashboards and alerting,
  profiling, distributed tracing
- **Security:** AWS IAM, ABAC, just-in-time access, policy as code, threat
  modeling, C++ memory safety, privacy, data residency
- **Security & Compliance:** denial-of-service and denial-of-wallet
  mitigation, insider-risk access controls, red teaming, PCI DSS, sanctions
  screening, AML risk scoring, GRC compliance automation
- **AI Infrastructure:** Gemini and Vertex AI model serving, vLLM, AI
  accelerator capacity, Amazon Bedrock
- **AI Tooling:** LLM-assisted code analysis, Claude Code
- **Formal Verification:** Lean 4, machine-checked proofs, LLM-assisted proof
  development
- **Cloud & Infrastructure:** Google Cloud (GKE, Vertex AI), AWS (DynamoDB,
  SQS, Lambda, Aurora MySQL, CloudFormation, Glue), Azure
- **Containers & APIs:** Kubernetes, Docker, Terraform, GitHub Actions,
  FastAPI, REST APIs, gRPC
- **Frameworks, Storage & Data:** Salesforce (Lightning, SOQL), Spanner,
  Postgres, MySQL, DynamoDB, Redis, Databricks, ETL pipelines

## Work Experience

**Software Engineer** | Google | Sunnyvale, CA | July 2025 - Present

- Protected distributed-systems reliability, security, and privacy across
  Gemini and Vertex AI serving infrastructure, securing C++ serving paths
  against abuse and outages and extending model serving into an isolated
  cloud, improving trust in Google's AI platforms.
- Collaborated across Cloud Security, Billing, Product, Privacy, and Legal on
  design reviews, launch readiness, and oncall handoffs, while leading code
  reviews, mentoring around 10 engineers, onboarding new TLs/leaders, and
  presenting findings to engineering peers and senior stakeholders to align
  priorities and secure approvals.

*Gemini serving data plane: distributed systems reliability and security
(April 2026 - Present)*

- Hardened the C++ serving path against denial-of-service and
  denial-of-wallet cost exhaustion through deadline propagation, early
  rejection of expired requests, adaptive load shedding, and consumption caps,
  keeping the service available during overload.
- Diagnosed an AI accelerator defect via trace analysis, utilization
  correlation, and metric discrepancies, patched it with HTTP cancellation
  propagation, and drove the incident and postmortem with flag-flip mitigation
  and extensive safety testing.
- Moved retries onto a standard framework with exponential backoff, jitter,
  and service-wide retry budgets through a major refactor, then A/B
  load-tested identical synthetic traffic across replicas without customer
  data.
- Shipped the production fix for an out-of-memory incident using heap
  profiling, core dumps, and agentic analysis, adding memory-efficiency
  improvements, load shedding, observability, task scaling, and a
  crash-to-root-cause dashboard.
- Delivered data residency through region-pinned request tagging and
  location-aware backend selection, plus privacy and memory safety through
  absl::Span migration and ASan/MSan CI gating.

*Vertex AI on Google Cloud Dedicated, an isolated sovereign cloud
(July 2025 - March 2026)*

- Designed the infrastructure plan for Vertex AI Model Garden serving in
  Google Cloud Dedicated, a fully isolated sovereign cloud with no public
  Google Cloud dependency, and drove its first test control-plane deployment
  by establishing IAM, ACL, and turn-up procedures where no runbook existed.
- Mapped service dependencies through build-graph traversal and
  service-interface enumeration using agentic Gemini analysis, structured
  JSON, parallel package fan-out, and Python scripts, producing a 100+ task
  backlog executed in parallel.
- Built the team's first black-box monitoring using golden-path synthetic
  probes against per-region endpoints and probe-derived availability signals
  for future SLOs, setting the standard for Vertex services in that cloud.
- Enforced dependency-injection standards through custom reflection-based
  presubmit tests and drove AI coding tool adoption through setup guides and
  custom agents.

**Member of Technical Staff** | OpenAI | San Francisco, CA | September 2024 - April 2025

- Stepped into a reliability emergency on the internal just-in-time access
  service used by nearly all employees, diagnosing latency spikes and
  unattributed failures and hardening monitoring via Datadog APM tracing, RED
  metrics, and data-health validation pipelines, cutting p99 latency by over
  an order of magnitude.
- Instrumented p99 latency and error rates in Datadog with custom metrics,
  profiling, tracing, and composite monitors, establishing the monitoring
  baseline for security services and cutting recovery time from hours to
  minutes in one case.
- Eliminated duplicate records and constraint violations through idempotency
  keys, ON CONFLICT upserts, SELECT FOR UPDATE locks, and isolation-level
  tuning, while maintaining the policy-as-code pipeline on a custom Terraform
  provider and GitHub Actions and co-authoring the postmortem for a
  policy-migration incident.
- Automated inactive service-account detection with Databricks and PySpark by
  joining Entra ID sign-in logs and IAM credential-last-used reports, served
  on the company-wide security on-call rotation, and enforced least-privilege
  approvals through Terraform access checks.

**Senior Software Development Engineer, AWS Identity (IAM control plane)** | Amazon Web Services | Denver, CO | November 2022 - August 2024

- Directed 6 engineers as tech lead of an IAM control plane authorizing every
  AWS API call at hundreds of millions per second per AWS public figures,
  owning policy-evaluation RFCs, caching design, p99.9 latency targets, and
  availability budgets.
- Treated availability as a security property, automating issue resolution
  through auto-rollback and alerting, migrating configuration to CDK and
  CloudFormation, and adding monitoring and tests across every AWS region,
  cutting the team's on-call load.
- Drove attribute-based access control (ABAC) strategy across organizations,
  principals, tags, and tag policies for hundreds of AWS service teams
  integrating with IAM, repairing broken authorization-stack integrations via
  static code analysis.
- Found zero-day vulnerabilities through red teaming, mitigating them through
  patches and re-architecture, and in 2023 applied Claude on Amazon Bedrock to
  catch integration errors missed by static analysis.

**Staff Software Engineer** | Twilio | Denver, CO | July 2021 - October 2022

- Managed 6 engineers as tech lead and 4 months as interim engineering manager
  on the billing platform, migrating it to Amazon Aurora MySQL while
  processing over 1 billion daily billing transactions — written up on the
  [AWS Database Blog](https://aws.amazon.com/blogs/database/how-twilio-modernized-its-billing-platform-on-amazon-aurora-mysql/).
- Diagnosed defects in a half-finished Kafka-to-SQS migration at maximum
  utilization, using queueing theory to predict throughput limits, win
  prioritization for the fix, and avert month-end close delays and message
  loss.
- Owned the ETL workstream for revenue data on AWS Glue with Spark,
  guaranteeing correctness through reconciliation jobs and working with
  security to approve a technology new to Twilio.
- Hardened a legacy billing service through query and pagination rebuilds,
  UTC normalization and spring-forward regression tests, lower log costs, and
  restricted billing-data access under PCI DSS.

**Software Development Engineer** | Amazon | Denver, CO | July 2019 - July 2021

- Shipped retail web service changes to hundreds of millions of customers on a
  legacy stack with limited rollback, spanning order and fulfillment
  pipelines, frontend, and backend to enable ordering experiences like digital
  items linked to physical items returned together.

**Software Engineer** | Google | Boulder, CO | December 2015 - June 2019

- Migrated sanctions screening from the legacy Google Payments case-review
  platform over 6 months and 9,000+ lines of code, automating document
  requests and cutting manual first-level operations reviews 61%.
- Built a prototype migration tool and co-wrote a framework guide used by 50
  teams, advanced an A/B testing framework for Payments latency regressions,
  and led a tool reviewing 26,000 Street View images weekly, cutting page
  latency from 8-9 to 1-2 seconds.
- Designed a nightly batch service ranking Payments customers into 5
  monthly-volume tiers, live since 2016 and still in production in 2026, and
  completed 65 Java readability code reviews in 6 months as a certified
  reviewer.

**Software Developer** | Trifecta Technologies | Allentown, PA | December 2014 - December 2015

- Developed Salesforce e-commerce and booking systems for an events client
  using Apex, SOQL, and JavaScript.

## Projects

**[Overload](https://github.com/matt-w-horn/overload)** | July 2026

- Built an Apache 2.0 open-source Lean 4 library with 700 verified theorems
  and definitions on retry-driven congestion collapse and safe retry limits,
  using Claude Code while owning modeling and verification, with the paper in
  Google's publication review.

## Education & Publications

**Bachelor of Science, Computer Science** | Muhlenberg College | Allentown, PA | August 2010 - May 2014

Minors in Mathematics and Music Theory. Recipient of the Dr. Anthony J. Marino Jr. Award in Computing Science (2013).

W. E. Wong, T. Gidvani, A. Lopez, R. Gao, and M. Horn, "Evaluating Software Safety Standards: A Systematic Review and Comparison," in *2014 IEEE Eighth International Conference on Software Security and Reliability-Companion*, San Jose, CA, 2014, pp. 78-87. [doi.org/10.1109/SERE-C.2014.25](https://doi.org/10.1109/SERE-C.2014.25)

## Contact

matt [at] matthorn [dot] io
