+++
title = "Resume"
author = "Matt Horn"
+++

**Software & Security Engineer** · Distributed Systems & AI

Sunnyvale, CA · [LinkedIn](https://www.linkedin.com/in/matt-horn-718611197/) · [GitHub](https://github.com/matt-w-horn) · [Two-page PDF](/resume.pdf)

12 years of experience building AI serving infrastructure, sovereign cloud deployments, and identity data planes at Google, OpenAI, AWS, and Twilio. Specializes in distributed systems reliability, AI model serving, IAM and ABAC, DoS and denial-of-wallet mitigation, and formal verification in Lean 4; has led teams of 6 engineers and served as interim manager.

## Technical Skills

- **Languages & Verification:** C++, Python, Java, TypeScript, JavaScript, SQL, Lean 4 (machine-checked proofs), Apex
- **Distributed Systems & Reliability:** load shedding, deadlines and retries, idempotency, A/B load testing, black-box probers, incident response, postmortems, profiling, distributed tracing
- **Security & Identity:** AWS IAM, ABAC, just-in-time access, policy as code, DoS and denial-of-wallet mitigation, C++ memory safety (ASan/MSan), privacy, data residency, red teaming, PCI DSS, sanctions screening
- **AI & Cloud Infrastructure:** Gemini and Vertex AI model serving, vLLM, Amazon Bedrock, Google Cloud (GKE, Spanner, Pub/Sub), AWS (DynamoDB, Aurora MySQL, SQS, Lambda, Glue), Kubernetes, Terraform, Datadog, Kafka, Spark

## Work Experience

**Software Engineer** · Google · Sunnyvale, CA · *July 2025 - Present*

- **Gemini serving data plane (April 2026 - Present):** Hardened the C++ serving path against DoS and denial-of-wallet cost exhaustion via deadline propagation, early rejection of expired requests, adaptive load shedding, and consumption caps. Moved retries onto a standard framework with exponential backoff, jitter, and service-wide retry budgets, then A/B load-tested synthetic traffic across replicas. Diagnosed and patched an AI accelerator cancellation defect and an OOM incident; delivered region-pinned data residency and `absl::Span` / ASan / MSan memory-safety gating.
- **Vertex AI on Google Cloud Dedicated (July 2025 - March 2026):** Designed the infrastructure plan for Vertex AI Model Garden serving in a fully isolated sovereign cloud and drove its first test control-plane turn-up, establishing IAM, ACL, and turn-up procedures from scratch. Mapped 100+ service-dependency tasks via build-graph traversal and agentic Gemini analysis, and built the team's first golden-path black-box monitoring probes.

**Member of Technical Staff** · OpenAI · San Francisco, CA · *September 2024 - April 2025*

- Stepped into a reliability emergency on the internal just-in-time access service used by nearly all employees, cutting p99 latency by over an order of magnitude and recovery time from hours to minutes through Datadog APM tracing, RED metrics, profiling, and composite monitors.
- Eliminated duplicate records and constraint violations via idempotency keys; maintained the custom Terraform policy-as-code pipeline and automated inactive service-account detection in Databricks and PySpark.

**Senior Software Development Engineer, AWS Identity (IAM control plane)** · Amazon Web Services · Denver, CO · *November 2022 - August 2024*

- Tech lead for 6 engineers on an IAM control plane authorizing every AWS API call at hundreds of millions per second, owning policy-evaluation RFCs, caching design, p99.9 latency targets, and availability budgets.
- Drove ABAC strategy across hundreds of integrating AWS service teams, automated regional rollbacks and alerting to cut on-call load, uncovered and patched critical authorization-bypass defects through internal red teaming, and applied Claude on Amazon Bedrock in 2023 to catch integration defects missed by static analysis.

**Staff Software Engineer** · Twilio · Denver, CO · *July 2021 - October 2022*

- Tech lead for 6 engineers (and 4 months as interim engineering manager) migrating the billing platform to Amazon Aurora MySQL at over 1 billion daily billing transactions, featured on the [AWS Database Blog](https://aws.amazon.com/blogs/database/how-twilio-modernized-its-billing-platform-on-amazon-aurora-mysql/).
- Used queueing theory to diagnose and fix throughput limits in a Kafka-to-SQS migration before month-end close, owned revenue ETL reconciliation on AWS Glue and Spark, and hardened legacy billing services under PCI DSS.

**Software Development Engineer** · Amazon · Denver, CO · *July 2019 - July 2021*

- Shipped retail order and fulfillment web service changes to hundreds of millions of customers across frontend and backend stacks, including linked digital-and-physical item returns.

**Software Engineer** · Google · Boulder, CO · *December 2015 - June 2019*

- Migrated Google Payments sanctions screening over 9,000+ lines of code (cutting manual first-level operations reviews 61%), built a 5-tier customer volume batch service live since 2016 and still in production in 2026, and cut Street View review tool latency from 8-9s to 1-2s.

**Software Developer** · Trifecta Technologies · Allentown, PA · *December 2014 - December 2015*

- Built Salesforce e-commerce and booking systems for an events client using Apex, SOQL, and JavaScript.

## Projects

**[Overload](https://github.com/matt-w-horn/overload)** · *July 2026*

- Apache 2.0 open-source Lean 4 library with 700 verified theorems and definitions on retry-driven congestion collapse and safe retry limits, built with Claude Code while owning modeling and verification.

## Education & Publications

**Bachelor of Science, Computer Science** · Muhlenberg College · Allentown, PA · *2010 - 2014*
Minors in Mathematics and Music Theory · Dr. Anthony J. Marino Jr. Award in Computing Science (2013)

W. E. Wong, T. Gidvani, A. Lopez, R. Gao, and M. Horn, "Evaluating Software Safety Standards: A Systematic Review and Comparison," *2014 IEEE Eighth International Conference on Software Security and Reliability-Companion*, San Francisco, CA, pp. 78-87. [doi.org/10.1109/SERE-C.2014.25](https://doi.org/10.1109/SERE-C.2014.25)

## Contact

matt [at] matthorn [dot] io
