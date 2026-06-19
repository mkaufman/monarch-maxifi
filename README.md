# monarch-maxifi

A personal finance dashboard that answers one question: **Am I on track with my MaxiFi plan this year?**

It pulls your actual year-to-date spending from [Monarch Money](https://www.monarch.com/) and compares it against the annual budget targets from your [MaxiFi Planner](https://www.maxifi.com/) — category by category, in real time.

---

## Who this is for

This tool is designed for people who:

- Use **Monarch Money** to track day-to-day spending
- Use **MaxiFi Planner** to model their retirement finances
- Want a single view showing whether their actual spending is on pace with their MaxiFi plan for the year

It runs entirely on your own computer. Your financial data never leaves your machine — it connects directly to Monarch's API using your own account credentials via a secure OAuth sign-in. No passwords are stored by this app.

---

## What it does

- Fetches your year-to-date spending from Monarch, broken down by category
- Compares it to your MaxiFi fixed and discretionary budget targets
- Forecasts your full-year spending based on current pace
- Breaks down Fixed spending by MaxiFi subcategory (Housing, Taxes, Retirement, etc.) with budget vs. forecast for each line
- Flags categories that are over-budget or on track
- Lets you configure how each spending category maps to your MaxiFi plan

---

## Prerequisites

Before you begin, make sure you have all of the following.

### Accounts

- A **Monarch Money** account with active transaction syncing
- A **MaxiFi Planner** account with an annual plan you've run (you'll enter the budget numbers manually)

### Software

- **Node.js** version 20 or later — download from [nodejs.org](https://nodejs.org). Choose the "LTS" version.
- **Git** — usually pre-installed on Mac. On Windows, download from [git-scm.com](https://git-scm.com).

---

## Setup

### 1. Download the code

Open a terminal and run:

```bash
git clone https://github.com/mkaufman/monarch-maxifi.git
cd monarch-maxifi
```

### 2. Install dependencies

```bash
npm install
```

This downloads the libraries the app needs. It may take a minute.

### 3. Start the app

```bash
npm run dev
```

Open your browser and go to **http://localhost:3000**.

The app will create a small local database file at `data/monarch-maxifi.db` on the first run. This stores your configuration, budget settings, and Monarch credentials.

### 4. Connect to Monarch

On the first visit you'll see a **Connect with Monarch** button. Click it.

You'll be redirected to Monarch's website to log in and approve access. This is Monarch's standard sign-in flow — this app never sees your Monarch password. After you click **Authorize**, Monarch redirects you back to the dashboard and your data starts loading automatically.

Your authorization is stored locally and refreshed silently in the background. **You will not need to reconnect each session.**

---

## Configuration

Before the report is meaningful, you need to configure a few things in **Settings** (the Settings link in the top navigation).

### Household Members

Enter the first names of the people in your household. These names are used to label the retirement contribution lines in the budget — for example, entering "Jane" and "Bob" will display "Jane's Retirement Contributions" and "Bob's Retirement Contributions" throughout the app.

If you're a single-person household, fill in Person 1 and leave Person 2 blank.

### MaxiFi Budget Values

Find both values in MaxiFi under **Reports → Base Plan Dashboard → Discretionary Spending Plan**. Enter them in the **MaxiFi Budgets** section:

- **Discretionary Total** — your MaxiFi annual discretionary spending budget
- **Fixed Total** — your MaxiFi annual fixed spending budget

In the **Fixed Subcategories** section, enter the breakdown of your fixed budget. Most values come from **Reports → Base Plan Report → Spending → Spending Overview** in MaxiFi — each field corresponds to a column in that table:

| Field | Where to find it in MaxiFi |
|---|---|
| Housing | Spending Overview — **Housing** column |
| Medicare Part B Premium | Spending Overview — **Medicare Part B Premium** column |
| Life Premium | Spending Overview — **Life Premium** column |
| Person 1's Retirement Contributions | Spending Overview — **Person 1's Retirement Contributions** column |
| Person 2's Retirement Contributions | Spending Overview — **Person 2's Retirement Contributions** column |
| Taxes | Spending Overview — **Taxes** column |
| HSA Contributions | **Reports → Base Plan Report → Saving → Health Savings Account Saving Plan** |

If MaxiFi doesn't include a particular line item in your plan, leave that field as zero.

Once entered, these subcategory amounts appear in the **Fixed Spending card** on the main report as a per-line breakdown — forecasted annual total, budget, and variance for each line. Click "Subcategory Breakdown" in the card to expand it.

### Special Expenses

If your MaxiFi plan includes special expenses for the year (a car purchase, a home project, a medical procedure), add them in the **Special Expenses** section. You can find these values in MaxiFi under **Base Plan Profile → Household → Special Expenses**. These are included in your Fixed budget total for comparison purposes.

### Category Configuration

The **Category Configuration** section shows every spending category from your Monarch account. For each one, you can set:

- **Bucket** — whether it counts as Fixed, Discretionary, or Excluded (for transfers and savings)
- **Forecast Model** — how the app projects your full-year spending from your year-to-date actuals (see below)
- **MaxiFi Subcategory** — for fixed categories, which line in your MaxiFi plan it maps to (Housing, Taxes, Retirement, etc.). This drives the subcategory breakdown in the Fixed Spending card on the report.

The app pre-fills sensible defaults for common categories. Review and adjust as needed.

#### Forecast models

| Model | How it works | Best for |
|---|---|---|
| **Run Rate** | Annualizes your YTD pace (YTD ÷ days elapsed × 365) | Most variable expenses |
| **Monthly** | Your entered monthly amount × 12 | Fixed recurring bills with a known monthly cost |
| **Annual** | A specific annual amount you enter | Expenses with a known full-year total |
| **Adjusted Run Rate** | Run rate after subtracting a one-time amount and/or adding a known future amount | Categories with a large non-recurring transaction skewing the pace |
| **No Further Spend** | Uses your YTD actual as the full-year forecast | Expenses you know are done for the year |

---

## Running the app day-to-day

Each time you want to use the dashboard:

```bash
cd monarch-maxifi
npm run dev
```

Then open **http://localhost:3000** in your browser. Press `Ctrl+C` in the terminal when you're done to stop the server.

The app reconnects to Monarch automatically on each refresh — no token management required.

---

## Disconnecting

To sign out of Monarch, click **Disconnect** in the top-right navigation. This clears your stored credentials from the local database and returns you to the Connect screen.

To reconnect, click **Connect with Monarch** and complete the sign-in flow again. It takes about 10 seconds.

---

## Troubleshooting

**The report shows an error after loading for a while.**
This usually means the connection to Monarch timed out. Click **Refresh** to try again. If it keeps failing, click **Disconnect**, then reconnect — this gets a fresh set of credentials.

**I see "Connect with Monarch" even though I've connected before.**
The app stores credentials in `data/monarch-maxifi.db`. If that file was deleted, or if you moved the app to a new machine, you'll need to connect again.

**The numbers look wrong or categories are missing.**
Go to **Settings → Category Configuration** and check that each category is assigned to the right bucket. Categories with no bucket assignment are excluded from the report and shown in a warning at the top.

---

## Disclaimer

This is an independent open source project and is **not affiliated with, endorsed by, or supported by Monarch Money or MaxiFi Planner**. It uses Monarch's official OAuth API. MaxiFi budget values are entered manually — this app does not connect to MaxiFi directly.

Use at your own discretion. No warranty is provided.
