# Spavio AI Store docs

Flow and feature documentation. The files in `customer/` and `admin/` are also shown inside the admin panel under **Docs**.

- `customer/` — what shoppers can do and how the flows work
- `admin/` — how to run the store from the admin panel

To add a page, drop a `.md` file in either folder. Prefix the file name with a number (`04-my-page.md`) to control the order; the title comes from the file name. Update the docs when a feature changes, and mark unfinished features as "Planned".

## Testing
`testing/` holds the [test plan](testing/01-test-plan.md) (what to check, with expected results) and the [test environment guide](testing/02-test-environment.md) (how to test with dummy data without touching the real store). The test data scripts are in `drizzle/seed/`.
