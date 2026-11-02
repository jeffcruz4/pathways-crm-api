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

The RDS instance is fully isolated under the `pathways-dev` prefix. It only
**borrows the network**: the `dev` environment discovers the corvia VPC (tag
`Name=corvia-dev-vpc`) and its private subnets (tag `tier=private`) via AWS data
sources — it never reads the corvia stack's Terraform state.

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

No `terraform.tfvars` is needed — the VPC/subnets are discovered, and by default
the DB allows the corvia VPC's own CIDR so the first migrate/seed works. Tighten
to the API's task SG later (see `terraform.tfvars.example`).

Outputs: `db_endpoint`, `db_port`, `db_name`, `db_security_group_id`,
`master_secret_arn`.

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

3. **Run migrations + seed** (once, from a host that can reach the DB — a
   one-off ECS task, a bastion, or an SSM port-forward):
   ```sh
   DATABASE_URL="postgres://…?sslmode=require" pnpm db:migrate
   DATABASE_URL="postgres://…?sslmode=require" pnpm db:seed   # optional sample data
   ```

4. **Flip the backend.** Set `DATA_BACKEND=postgres` + `DATABASE_URL` on the API
   service. `GET /healthz` will report `"backend":"postgres"`.

## Local development (no RDS needed)

A local Postgres in Docker mirrors the RDS path:

```sh
docker run --rm --name pathways-pg -e POSTGRES_PASSWORD=pathways \
  -e POSTGRES_USER=pathways -e POSTGRES_DB=pathways -p 5433:5432 postgres:16-alpine

export DATABASE_URL="postgres://pathways:pathways@localhost:5433/pathways"
pnpm db:migrate && pnpm db:seed
DATA_BACKEND=postgres PORT=8081 pnpm dev
curl http://localhost:8081/healthz   # -> "backend":"postgres"
```

## Not included yet (follow-ups)

- The API's ECS service + ALB (deploy infra) — add alongside, then set
  `allowed_security_group_ids` to its task SG and re-apply.
- Secret rotation cadence and a read-replica for prod.
