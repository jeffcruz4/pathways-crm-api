# Pathways CRM API — Infrastructure (Terraform)

Provisions a **dedicated RDS PostgreSQL** instance for the CRM API that **reuses
the existing corvia VPC + private subnets** (it does not stand up new
networking). Low-cost dev defaults: single-AZ, `db.t4g.micro`, 20 GB with
storage autoscaling, 7-day backups. The master password is **RDS-managed in
Secrets Manager** — it never appears in Terraform state or code.

## What it creates

| Module | Resources |
|---|---|
| `modules/rds` | DB subnet group, a DB security group, and the `pathways-dev-postgres` instance with the master secret in Secrets Manager |
| `modules/ecr` | ECR repository (`pathways/api`) for the API/migrator image — scan-on-push + a lifecycle policy |
| `modules/migrator` | A **one-off Fargate task definition** that runs the API image to apply migrations/seed, its own security group (allowed into the DB SG), log group, and exec/task roles |
| `modules/github-oidc` | A least-privilege **GitHub OIDC deploy role** (`pathways-dev-gha-deploy`) the repo's Actions use to push images + run the migrator — no long-lived keys |

The RDS instance is fully isolated under the `pathways-dev` prefix. It only
**borrows the network**: the `dev` environment discovers the corvia VPC (tag
`Name=corvia-dev-vpc`) and its private subnets (tag `tier=private`) via AWS data
sources, and reuses the existing `corvia-dev-cluster` ECS cluster to run the
migrator — it never reads the corvia stack's Terraform state.

## Prerequisites

- The corvia VPC + private subnets exist (from `corvia-digital-services`). The
  state bucket (`corvia-tfstate-038462763287`) + lock table (`corvia-tf-locks`)
  are reused via `backend.tf` under a separate `pathways-api/` key.
- Apply from an identity with RDS/EC2/Secrets Manager/S3 (state) permissions.

## Apply (zero required inputs)

```sh
cd infra/terraform/environments/dev
terraform init
terraform plan        # review: 1 RDS instance + subnet group + SG
terraform apply
```

No `terraform.tfvars` is needed — the VPC/subnets/cluster are discovered, the
account's existing GitHub OIDC provider is reused
(`create_github_oidc_provider=false`), and by default the DB allows the corvia
VPC's own CIDR plus the migrator's SG so the first migrate/seed works. Tighten
to the API's task SG later (see `terraform.tfvars.example`).

Key outputs: `db_endpoint`, `db_port`, `db_name`, `db_security_group_id`,
`master_secret_arn`, `ecr_repository_url`, `cluster_name`,
`migrator_task_family`, `migrator_subnet_ids`, `migrator_security_group_id`,
`gha_deploy_role_arn`.

### Apply from CI (`deploy.yml`)

Routine infra changes can run through GitHub Actions instead of locally, using
the same OIDC pattern as `corvia-digital-services`:

- **ci.yml** validates on every PR/push: `terraform fmt -check` +
  `init -backend=false` + `validate` (plus the API typecheck/build).
- **deploy.yml** is a manual `workflow_dispatch`: it always runs
  `terraform plan` (uploads the plan as an artifact), then runs
  `terraform apply` of that saved plan **only after** the `production`
  environment's required reviewers approve. Inputs: `image_tag` (default `dev`)
  and `existing_github_oidc_provider_arn` (the account's OIDC provider ARN, so
  the `github-oidc` module reuses it).

**The deploy role (`AWS_ROLE_ARN`).** By default this stack does **not** create a
deploy role (`create_github_oidc_role=false`) — you reuse an existing role.
Whichever role you use for `deploy.yml` must be allowed to manage this stack
(RDS/EC2/SG/IAM/ECR/ECS) and read the state bucket + lock table. The
least-privilege `pathways-dev-gha-deploy` role (created only when you flip
`create_github_oidc_role=true`) is scoped to ECR/ECS/PassRole/logs for
`build-and-push.yml`/`migrate.yml` and is **not** broad enough to run Terraform.

To reuse your existing role, its **trust policy** must allow this repo to assume
it via GitHub OIDC. A ready-to-edit document is at
`infra/iam/github-oidc-trust-policy.json` — replace `<ACCOUNT_ID>` and attach it
as the role's trust relationship (or merge the `StringLike` subjects into your
existing GitHub trust statement). Then set the role's ARN as the repo secret
`AWS_ROLE_ARN`.

**Bootstrap caveat:** if you *do* let this stack create the role
(`create_github_oidc_role=true`), the first apply must run locally with your own
credentials, because the role `deploy.yml` authenticates with doesn't exist yet.

## Connecting the API

1. **Build `DATABASE_URL` from the master secret.** The secret
   (`master_secret_arn`) holds JSON `{ "username", "password" }`. The URL is:
   ```
   postgres://<username>:<password>@<db_endpoint>:5432/pathways?sslmode=require
   ```
   In ECS, inject the username/password from the secret and the host/db as plain
   env, then assemble `DATABASE_URL` (or inject the whole URL from a secret you
   compose). Never put the password in plain env or state.

2. **Lock down network access.** After the API's ECS service exists, set
   `allowed_security_group_ids = ["<api-task-sg>"]` and re-apply so only the API
   can reach Postgres.

3. **Run migrations + seed** — turnkey, via the one-off migrator task (see
   "Migrate the database" below). You don't need a bastion or SSM port-forward;
   the migrator runs inside the VPC and reaches RDS directly.

4. **Flip the backend.** Set `DATA_BACKEND=postgres` + `DATABASE_URL` on the API
   service. `GET /healthz` will report `"backend":"postgres"`.

## Migrate the database (turnkey)

The migrator is the **same API image** run with a different command. The task
definition injects the RDS-managed credentials as discrete env vars
(`DB_USER`/`DB_PASSWORD` from the secret, plus non-secret
`DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_SSLMODE`); the migrate/seed scripts connect
from those parts directly (postgres-js options object) rather than building a
`DATABASE_URL` — so an RDS-managed password with URL-significant characters
(`?`, `:`, `@`, `]`, `$`) works without percent-encoding. It runs `migrate`,
`seed`, or `migrate+seed` based on the `MIGRATE_CMD` env. No password ever lives
in the task definition, state, or CI.

First, build and push the image so the migrator has something to run:

```sh
cd infra/terraform/environments/dev
REPO=$(terraform output -raw ecr_repository_url)
REGION=$(aws configure get region)
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${REPO%/*}"
docker build -t "$REPO:dev" ../../../..        # build context = repo root (Dockerfile there)
docker push "$REPO:dev"
```

### Option A — from your machine (`aws ecs run-task`)

```sh
cd infra/terraform/environments/dev
CLUSTER=$(terraform output -raw cluster_name)
FAMILY=$(terraform output -raw migrator_task_family)
SG=$(terraform output -raw migrator_security_group_id)
SUBNETS=$(terraform output -json migrator_subnet_ids | jq -r 'join(",")')

aws ecs run-task \
  --cluster "$CLUSTER" \
  --task-definition "$FAMILY" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides":[{"name":"migrator","environment":[{"name":"MIGRATE_CMD","value":"migrate+seed"}]}]}'
```

Watch progress in CloudWatch Logs under `/ecs/pathways-dev/migrator`. Use
`MIGRATE_CMD=migrate` (default), `seed`, or `migrate+seed`.

### Option B — from GitHub Actions (OIDC, no keys)

The repo ships these workflows (`.github/workflows/`) — image/DB here, infra
above under "Apply from CI":

- **build-and-push.yml** — on push to `main`, builds the image and pushes it to
  ECR tagged with the commit SHA and `dev` (the tag the migrator references).
- **migrate.yml** — `workflow_dispatch` with a `command` input
  (`migrate` | `seed` | `migrate+seed`). It builds/pushes, then runs the
  migrator task, waits for it, and tails the logs. The DB-changing job is gated
  behind the **`production` GitHub Environment**, so it waits for a required
  reviewer.

One-time setup in the repo's **Settings → Secrets and variables → Actions**:

| Kind | Name | Value (from `terraform output`) |
|---|---|---|
| Secret | `AWS_ROLE_ARN` | your existing deploy role ARN (only use `gha_deploy_role_arn` if you set `create_github_oidc_role=true`) |
| Variable | `AWS_REGION` | your region, e.g. `us-east-1` |
| Variable | `ECR_REPOSITORY` | `ecr_repository_url` |
| Variable | `ECS_CLUSTER` | `cluster_name` |
| Variable | `MIGRATOR_TASK_FAMILY` | `migrator_task_family` |
| Variable | `MIGRATOR_SUBNET_IDS` | `migrator_subnet_ids` (comma-separated) |
| Variable | `MIGRATOR_SECURITY_GROUP` | `migrator_security_group_id` |

Also create a **`production`** Environment with required reviewers. The OIDC
role only trusts this repo on `refs/heads/main` or the `production` environment,
so run the workflows from `main`.

## Local development (no RDS needed)

A local Postgres in Docker mirrors the RDS path. The dev DB isn't publicly
reachable (private subnets), so this is the fast loop for UI + API work — no
VPC tunnel required. Everything is turnkey via pnpm scripts:

```sh
pnpm db:up           # start local Postgres (docker-compose.dev.yml, :5433, persistent volume)
pnpm db:migrate      # apply migrations (defaults to the local DB_* above)
pnpm db:seed         # load the sample dataset
pnpm dev:pg          # API on :8081 with DATA_BACKEND=postgres + the discrete DB_* parts
curl http://localhost:8081/healthz   # -> "backend":"postgres"

pnpm db:down         # stop Postgres when done (volume persists)
```

`pnpm dev` still runs the default memory backend; `pnpm dev:pg` is the
Postgres-backed variant. The `db:migrate`/`db:seed` scripts default to the local
DB but honor exported `DB_*` vars, so they also work against RDS over a tunnel.

## Not included yet (follow-ups)

- The API's ECS service + ALB (deploy infra) — add alongside, then set
  `allowed_security_group_ids` to its task SG and re-apply.
- Secret rotation cadence and a read-replica for prod.
