# Account and login

## Create an account
1. Open **Sign up** (`/signup`).
2. Enter an email and a password (at least 8 characters). Optionally tick the box to receive news about new devices and offers.
3. If email confirmation is enabled, click the link in the confirmation email. It brings you back to the login page.

## Sign in
Use **Login** (`/login`) with your email and password. After several failed attempts the form temporarily locks to slow down guessing.

## Your account page
`/account` shows:
- your email,
- your **saved bag** with a shortcut to checkout,
- your **warranty and support tickets** (see Warranty and support),
- a **sign out** button,
- for staff only, a card with a link to the admin panel.

## What happens to your data
Accounts are stored in Supabase Auth. A profile row (id, email, name) and a customer record are created automatically for each new user. Guests who check out without an account get a customer record too, but no account.
