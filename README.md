# YaraConnect Help: Jira auto-update sample

**Live site:** https://sahityapettugani.github.io/Testpilot/

A working sample of the YaraConnect user guide site, built from the wireframes
(Home and Feature guide page). Guide content is stored as JSON. When a Jira ticket
ships, GitHub drafts the guide change as a pull request. Merging the pull request
republishes the site.

```
Jira ticket → Done ──(Automation: Send web request)──▶ GitHub repository_dispatch
      ──▶ Action runs scripts/apply-jira-update.mjs ──▶ Pull request "Docs: YC-482 …"
      ──▶ you review and merge ──▶ Pages republishes ──▶ "Updated" badge + What's new entry
```

## What's in here

| Path | What it is |
|---|---|
| `index.html` | Home: role picker, country, search, topics, What's new |
| `guide.html?id=…` | Feature guide page: Android/iPhone toggle, steps, "What changed recently" |
| `content/guides.json` | All guide content. Each guide has a `featureId`, which Jira tickets point to |
| `features.html` | App features: all 20 features, each linked to its guide |
| `content/features.json` | Feature list (from the feature map) |
| `content/whats-new.json` | What's new feed (Jira updates are added at the top) |
| `scripts/apply-jira-update.mjs` | Applies one ticket to the content (optionally drafts the wording with Claude) |
| `.github/workflows/jira-doc-update.yml` | Runs on a Jira event or manually, then opens a pull request |
| `.github/workflows/deploy-pages.yml` | Publishes the site to GitHub Pages on every push to `main` |
| `scripts/simulate-jira.sh` | Sends the same request Jira will send, for testing |

## Run it locally

```bash
npx serve .            # then open http://localhost:3000
node scripts/apply-jira-update.mjs test/sample-jira-payload.json   # apply a fake ticket
```

Then reload the receipt guide. It shows the yellow **What changed recently** box, step 2
is highlighted, and the home page's What's new lists YC-482.
Run `git checkout content/` to reset.

## One-time GitHub setup

1. **Settings → Pages →** Source: **GitHub Actions**.
2. **Settings → Actions → General →** Workflow permissions: tick
   **Allow GitHub Actions to create and approve pull requests**.
3. Optional: **Settings → Secrets and variables → Actions →** add `ANTHROPIC_API_KEY`
   so Claude rewrites ticket text into reader-friendly wording. Without it, the
   ticket's "User-facing change" text is used as written.

## Test without Jira (sample test)

**Actions → Jira → guide update → Run workflow.** The form is pre-filled with a sample
ticket (YC-482, PDF receipts). After it runs, open **Pull requests**, review and merge,
then watch **Publish site**.

## Connect Jira

1. **GitHub token:** Settings → Developer settings → Fine-grained tokens. Give it access
   to this repo only, with **Contents: Read and write**.
2. **Jira:** Project settings → Automation → Create rule
   - Trigger: *Work item transitioned* → to **Done** (or **Released**)
   - Condition: *Labels contains* `doc-impact`
   - Action: *Send web request*
     - URL: `https://api.github.com/repos/<OWNER>/<REPO>/dispatches`
     - Method: `POST`
     - Headers: `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`
     - Body (Custom data):
       ```json
       {
         "event_type": "jira-doc-update",
         "client_payload": {
           "key": "{{issue.key}}",
           "summary": "{{issue.summary.jsonEncode}}",
           "change": "{{issue.User-facing change.jsonEncode}}",
           "feature": "{{issue.components.name}}",
           "version": "{{issue.fixVersions.name}}",
           "url": "{{issue.url}}",
           "stepIndex": "{{issue.Step number}}",
           "stepText": "{{issue.New step text.jsonEncode}}"
         }
       }
       ```
   Use the exact name of your custom field in `{{issue.User-facing change…}}`.
3. In Jira, give Components the same names as the `featureId` values in
   `content/guides.json` (for example `YC-EARN-RECEIPT`).

### Jira Component names (one per guide)
Create these as Components in your Jira project. A ticket's Component tells the
pipeline which guide page to update.

| Component | Guide page |
|---|---|
| `YC-ONBOARD-INSTALL` | Install the app |
| `YC-ONBOARD-REGISTER` | Register your shop |
| `YC-ONBOARD-VERIFY` | Verify your account |
| `YC-ACCOUNT-LOCATION` | Set your shop location and photo |
| `YC-SHOP-MULTISHOP` | Add branches and shop assistants |
| `YC-SHOP-STOCK` | Update your stock |
| `YC-SHOP-PROFILE` | Set up your online shop |
| `YC-FARMER-ORDERS` | Handle farmer orders |
| `YC-FARMER-USSD` | Orders from basic phones (USSD) |
| `YC-FARMER-ASSISTED` | Order for a farmer (assisted order) |
| `YC-FARMER-REFERRAL` | Invite farmers (Farmers club) |
| `YC-FARMER-PAYMENTS` | Get paid with M-Pesa |
| `YC-DOS-ORDER` | Order from Yara (DOS) |
| `YC-DOS-TRACK` | Track a Yara order |
| `YC-ROS-ORDER` | Order from your distributor (retailer) |
| `YC-ROS-APPROVE` | Approve retailer orders (distributor) |
| `YC-EARN-RECEIPT` | Earn points with a receipt |
| `YC-EARN-QR` | Scan QR codes |
| `YC-EARN-HISTORY` | Check your transaction history |
| `YC-REWARDS-REDEEM` | Redeem a reward |
| `YC-REWARDS-TIERS` | Tiers and quarterly rebates |
| `YC-SALES-DASHBOARD` | Read your sales dashboard |
| `YC-NEWSFEED` | Read news and tips |
| `YC-SUPPORT` | Get help and contact support |
| `AP-RECEIPTS` | Approve receipts (Admin Portal) |

### Optional fields a ticket can send
`stepIndex` (step number that changed) and `stepText` (new wording for that step).
If neither is sent and Claude is enabled, Claude suggests which step to rewrite.
