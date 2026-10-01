# Team, roles and audit log

Both pages are under **Store settings**.

## Roles
| Role | Can do |
| --- | --- |
| Super Admin | Everything, including granting roles |
| Inventory Manager | Manage products and stock |
| Order Processor | Access the admin panel (order tools are planned) |

Any role grants access to `/admin`. Only a Super Admin can change roles on **Team & roles**.

## Giving someone access
1. They sign up at `/signup`.
2. A Super Admin opens **Team & roles** and ticks the role.

## Audit log
Product edits, status changes, archive/restore/delete and stock adjustments are recorded with the actor, time and details.
