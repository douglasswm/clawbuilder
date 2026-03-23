# ClawBuilder User Stories

This document captures the target-state user stories for ClawBuilder as a roadmap-facing product artifact. A single authenticated account can act as a subscriber, buyer, and seller depending on the workflow being performed.

ClawBuilder manages account access, billing, deployment orchestration, per-deployment AI account connections, snapshot lifecycle, and marketplace transactions. Billing is subscription-based on a per-agent basis, which means each live deployment is treated as a billable agent. Post-deploy OpenClaw configuration happens inside the deployed OpenClaw environment and is not managed by ClawBuilder.

## Platform Vision

ClawBuilder is the control plane for launching, monetizing, and managing OpenClaw instances across multiple cloud providers. The platform should make it easy for a user to go from authenticated account to live deployment, connect their own AI subscriptions and secure access, preserve successful configurations as reusable snapshots, and eventually package those configurations as products that can be sold through the app store.

The product vision is built around four outcomes:

- Make OpenClaw deployment accessible with provider-first, template-aware workflows instead of manual cloud setup.
- Treat each live deployment as a managed commercial unit with clear per-agent billing, usage visibility, and lifecycle controls.
- Let users turn working OpenClaw environments into reusable assets through snapshots, backups, and marketplace listings.
- Provide a trusted commerce layer where sellers can onboard payouts through Stripe Connect, buyers can purchase with confidence, and both sides can track transactions and support status.

## Product Roadmap

The implementation sequence below reflects product dependencies between user stories. Stories in the same phase can often be built in parallel, but later phases depend on earlier platform capabilities being in place.

### Phase 1: Platform Access and Billing Foundation

- `US-001` Google sign-in and per-agent billing activation
- Outcome: authenticated users can access the product and the platform can gate all live deployments behind billing readiness.
- Dependency note: this phase should ship before any deployment or marketplace flow because all later actions depend on account identity and payment state.

### Phase 2: Core Deployment Experience

- `US-002` Deploy the golden copy OpenClaw instance
- `US-003` Deploy a curated platform agent template
- `US-006` View deployment status and access handoff
- Outcome: users can launch provider-backed OpenClaw instances and monitor them through the core deployment lifecycle.
- Dependency note: `US-006` depends on deployment creation existing first, so `US-002` and `US-003` are the entry point for this phase.

### Phase 3: Per-Deployment Configuration and Access

- `US-004` Connect a personal AI subscription to a deployment
- `US-005` Enable Tailscale Funnel for a deployment
- Outcome: users can personalize each deployment with model credentials and secure access after the base instance exists.
- Dependency note: both stories depend on deployed instances from Phase 2, because they attach to an existing deployment rather than creating one.

### Phase 4: Snapshot Lifecycle Management

- `US-007` Export or back up a deployment as a snapshot
- `US-008` Delete a deployment or snapshot safely
- Outcome: users can preserve, retire, and govern deployment assets over time.
- Dependency note: snapshot export depends on successful deployments from Phase 2, and deletion logic depends on both deployment and snapshot records existing.

### Phase 5: Seller Enablement and Marketplace Supply

- `US-009` Connect a seller payout account with Stripe
- `US-010` Publish a snapshot to the app store
- Outcome: sellers can become payout-ready and publish supported, commercialized OpenClaw snapshots.
- Dependency note: `US-010` depends on both payout readiness from `US-009` and snapshot creation from `US-007`.

### Phase 6: Marketplace Demand and Post-Purchase Lifecycle

- `US-011` Purchase a template from the app store
- `US-012` Redeploy a purchased template and review transactions
- Outcome: buyers can purchase templates, redeploy them, and view billing and commerce history in one place.
- Dependency note: `US-011` depends on published marketplace supply from Phase 5, and `US-012` depends on successful purchases plus the deployment capabilities from Phase 2.

## Conventions

- Story IDs are sequential from `US-001`.
- Each story uses the same structure: title, actor, status, current codebase note, user story statement, acceptance criteria, and happy flow.
- Acceptance Criteria sections use short list items.
- Happy Flow sections use numbered end-to-end steps.
- Terminology follows the product language used in this repo: Google Auth, OpenClaw, template, snapshot, provider, Tailscale, app store, Stripe, Stripe Connect, ChatGPT, and Claude Code.

## Status Flags

- `Implemented`: the core user-visible flow exists in the current codebase.
- `Partial`: some foundation exists in the current codebase, but the full story is not yet delivered.
- `Planned`: the story is not yet implemented in the current routes, server functions, or schema.

---

## US-001: Google Sign-In and Per-Agent Billing Activation
Actor: Subscriber
Status: `Partial`
Current Codebase Note: Google OAuth sign-in is implemented, but Stripe billing activation and per-agent subscription gating are not present in the current routes, server functions, or database schema.

As a Subscriber, I want to sign in with Google Auth and activate Stripe-backed per-agent billing before I deploy, so that each live OpenClaw deployment is billed as a paid agent under my account.

Acceptance Criteria:
- User can sign in with Google Auth using a supported Google account.
- New users are prompted to enroll in Stripe-backed billing before deployment actions are unlocked.
- Existing subscribers can sign in and manage previously billed deployments without re-entering billing details.
- System explains that billing is charged per live deployment rather than as one flat account-wide deployment fee.
- Users without an active billing setup can browse public marketing content but cannot launch a live OpenClaw deployment.
- System records billing status and ties billable agent subscriptions to the authenticated user account.

Happy Flow:
1. A visitor opens ClawBuilder and clicks `Continue with Google`.
2. The user completes Google Auth and returns to the platform as an authenticated account.
3. ClawBuilder checks whether the account has an active Stripe billing setup for paid agent deployments.
4. Because the user is new, the platform shows the billing activation flow and explains that each live deployment will be charged as a paid agent.
5. The user completes the Stripe billing setup.
6. Stripe confirms the successful billing activation to ClawBuilder.
7. The user is returned to the application with deployment access unlocked.
8. The dashboard now shows the deploy and app store features available to the subscriber.

---

## US-002: Deploy the Golden Copy OpenClaw Instance
Actor: Subscriber
Status: `Partial`
Current Codebase Note: The app can create DigitalOcean deployments and restore approved snapshots, but the current deploy flow is not provider-first and does not expose a dedicated golden copy option or multi-cloud provider selection.

As a Subscriber, I want to deploy the default golden copy OpenClaw instance to BytePlus, AWS Lightsail, or DigitalOcean, so that I can launch a baseline OpenClaw environment with one click.

Acceptance Criteria:
- Subscriber can select a supported provider: BytePlus, AWS Lightsail, or DigitalOcean.
- After the provider is selected, the platform shows the list of deployable templates or snapshots available for that provider.
- Subscriber can choose the default golden copy template from that provider-specific list.
- Deployment confirmation clearly indicates that the instance will become a billable live agent when it reaches a running state.
- System provisions the deployment from the golden copy snapshot for the chosen provider.
- System shows deployment progress, final status, and billable state to the subscriber.
- Successful live deployments are recorded under the subscriber's account for later management and billing.

Happy Flow:
1. The subscriber signs in to ClawBuilder with active per-agent billing enabled.
2. The subscriber clicks `Deploy OpenClaw`.
3. The subscriber selects `DigitalOcean` as the provider.
4. The platform shows the deployable template and snapshot list available for DigitalOcean.
5. The subscriber selects the default golden copy option as the baseline OpenClaw instance.
6. The subscriber reviews the deployment details, including that the deployment will be charged once it becomes live, and confirms the one-click deployment.
7. ClawBuilder creates the deployment request using the golden copy snapshot for the selected provider.
8. The platform shows the deployment moving through provisioning states.
9. The deployment reaches a running state, becomes a billable live agent, and is saved to the subscriber's deployment list.

---

## US-003: Deploy a Curated Platform Agent Template
Actor: Subscriber
Status: `Partial`
Current Codebase Note: Curated templates are loaded from `agent_templates` and can be restored on DigitalOcean, but templates do not yet show provider badges or provider-specific availability beyond the current DigitalOcean-only implementation.

As a Subscriber, I want to choose a curated platform agent template and deploy it to my preferred provider, so that I can start from a preconfigured OpenClaw setup instead of a blank baseline.

Acceptance Criteria:
- Subscriber can browse curated platform-managed templates during the deployment flow.
- Each template displays enough information for the subscriber to understand its intended use.
- When templates are shown before provider selection, each template displays pills or badges showing which cloud providers it supports.
- Subscriber can select a supported provider: BytePlus, AWS Lightsail, or DigitalOcean.
- Deployment confirmation shows that a successful live deployment is billed as one paid agent.
- System deploys the selected template from its mapped provider snapshot.
- The resulting deployment is associated with both the subscriber and the chosen template.
- The resulting live deployment is tracked as a billable agent under the subscriber's account.

Happy Flow:
1. The subscriber opens the deployment flow from the dashboard.
2. The subscriber browses the list of curated agent templates.
3. Each template card shows pills or badges for the supported providers, such as `BytePlus`, `AWS Lightsail`, or `DigitalOcean`.
4. The subscriber selects a template that matches the desired OpenClaw setup and confirms that `AWS Lightsail` is one of its supported providers.
5. The subscriber chooses `AWS Lightsail` as the provider.
6. ClawBuilder shows a confirmation summary with the selected template, provider, and per-live-agent billing implication.
7. The subscriber confirms the deployment.
8. The platform provisions a new OpenClaw instance from the selected template snapshot.
9. The deployment appears on the subscriber's dashboard with its template name, current status, and billable live-agent state once running.

---

## US-004: Connect a Personal AI Subscription to a Deployment
Actor: Subscriber
Status: `Partial`
Current Codebase Note: Users can save Anthropic, OpenAI, Gemini, and Tailscale keys at the account level, but there is no deployment-level model account selector and no ChatGPT or Claude Code subscription connection flow.

As a Subscriber, I want to connect my own ChatGPT or Claude Code subscription to a specific OpenClaw deployment, so that each deployed instance can run with the AI account I choose.

Acceptance Criteria:
- Subscriber can connect a ChatGPT or Claude Code credential at the individual deployment level.
- Subscriber can optionally save an API key or credential reference at the user-account level as a reusable value object.
- Subscriber can select a saved credential for a new or existing deployment instead of re-entering it each time.
- System warns that reusing the same saved account across multiple deployments shares the same underlying usage pool and can burn through tokens or usage allowances quickly.
- Deployment details show which AI subscription or saved credential is attached to the instance.

Happy Flow:
1. The subscriber starts a new deployment or opens an existing deployment from the dashboard.
2. ClawBuilder offers the option to connect a personal ChatGPT or Claude Code subscription to that deployment.
3. The subscriber chooses `Save credential to my account` and enters an API key or credential reference once.
4. The platform stores the saved credential as a reusable account-level value object.
5. The subscriber selects that saved credential for the specific deployment.
6. ClawBuilder warns that if the same credential is reused across multiple deployments, all usage will hit the same underlying account and may consume tokens or allowances quickly.
7. The subscriber confirms the connection for that deployment.
8. The deployment now shows the selected personal AI subscription as its active model account.

---

## US-005: Enable Tailscale Funnel for a Deployment
Actor: Subscriber
Status: `Implemented`
Current Codebase Note: Running deployments can enable or disable Tailscale Funnel using a saved user key or platform fallback key, and the deployment detail page exposes the resulting public URL.

As a Subscriber, I want to paste my Tailscale API key after deployment and enable secure Funnel access, so that I can reach my OpenClaw instance through a managed remote access path.

Acceptance Criteria:
- Subscriber can save a personal Tailscale API key to the account.
- Subscriber can enable Tailscale Funnel for an eligible deployment after it is provisioned.
- System associates the secure access flow with the subscriber's own Tailscale credentials.
- System shows whether Tailscale Funnel is configured, enabled, or unavailable for the deployment.
- System provides the resulting access URL or connection details after successful setup.

Happy Flow:
1. The subscriber opens a running deployment from the dashboard.
2. The platform indicates that secure remote access can be enabled with Tailscale.
3. The subscriber pastes a Tailscale API key into the account settings or deployment access prompt.
4. ClawBuilder stores the key and begins the Funnel setup flow for the selected deployment.
5. The platform validates the deployment and applies the Tailscale configuration steps.
6. ClawBuilder marks the deployment as Tailscale-enabled when the setup succeeds.
7. The platform shows the generated Funnel URL to the subscriber.
8. The subscriber uses that secure URL to reach the deployed OpenClaw instance.

---

## US-006: View Deployment Status and Access Handoff
Actor: Subscriber
Status: `Partial`
Current Codebase Note: The dashboard and deployment detail pages show deployment lifecycle, region, size, model, IP, and Tailscale access, but they do not yet show billing state or deployment-level connected AI account status end to end.

As a Subscriber, I want to view deployment status, infrastructure details, and the handoff access path into my deployed OpenClaw environment, so that I can monitor readiness and open the instance when it is available.

Acceptance Criteria:
- Subscriber can view a list of deployments associated with the account.
- Each deployment shows a current lifecycle status such as pending, provisioning, running, failed, or destroyed.
- Subscriber can open a deployment detail view with provider and access-related metadata.
- Subscriber can see whether a deployment is currently a billable live agent.
- Deployment details show which saved AI credential or personal AI subscription is attached, if any.
- System clearly indicates when the deployment is ready for handoff into the OpenClaw environment.
- ClawBuilder stops at access handoff and does not imply that in-instance OpenClaw configuration is managed by the platform.

Happy Flow:
1. The subscriber opens the dashboard after starting one or more deployments.
2. ClawBuilder shows the deployment list with current statuses and live billing state.
3. The subscriber selects a deployment that has finished provisioning.
4. The deployment detail page shows the provider, status, billable state, connected AI account, and available access information.
5. The platform confirms that the instance is ready for use.
6. ClawBuilder presents the handoff entry point, such as the instance URL or secure access link.
7. The subscriber opens the deployed OpenClaw environment.
8. The subscriber continues any OpenClaw-specific setup inside that environment, outside of ClawBuilder.

---

## US-007: Export or Back Up a Deployment as a Snapshot
Actor: Subscriber
Status: `Planned`
Current Codebase Note: Snapshot and restore behavior appears in CLI-facing docs, but there is no user-facing route, server function, or snapshot data model in the current web application.

As a Subscriber, I want to export or back up an existing deployment as a reusable cloud snapshot, so that I can preserve a working OpenClaw setup for recovery, duplication, or future publishing.

Acceptance Criteria:
- Subscriber can trigger a backup or snapshot export from an owned deployment.
- Platform clearly informs the subscriber that creating a snapshot is a billable action.
- System creates a reusable snapshot compatible with the deployment's selected provider.
- Subscriber can name or identify the resulting snapshot for later use.
- Completed snapshots are visible for future restore, redeploy, or marketplace listing flows.
- System reports snapshot progress and success or failure status to the subscriber.

Happy Flow:
1. The subscriber opens a running deployment from the dashboard.
2. The subscriber chooses `Export Snapshot` or `Create Backup`.
3. ClawBuilder asks for a snapshot name or uses a sensible default naming pattern and warns that snapshot creation is billable.
4. The subscriber reviews the billing notice and confirms the export action.
5. The platform starts the provider-specific snapshot process and records it as a billable snapshot operation.
6. ClawBuilder shows progress while the snapshot is being created.
7. The export completes successfully and the snapshot is saved to the subscriber's library.
8. The subscriber sees the snapshot available for future redeployment or publishing.

---

## US-008: Delete a Deployment or Snapshot Safely
Actor: Subscriber
Status: `Partial`
Current Codebase Note: Deployment destruction is implemented with confirmation, status transitions, and a DigitalOcean API fallback, but snapshot deletion, discontinuation handling, and buyer notifications are not implemented.

As a Subscriber, I want to delete a deployment or snapshot I no longer need, so that I can stop using cloud resources, retire unused assets, and keep my account clean.

Acceptance Criteria:
- Subscriber can initiate deletion only for deployments owned by the account.
- Subscriber can initiate deletion only for snapshots owned by the account.
- System requires an explicit confirmation step before destructive deletion proceeds.
- System updates the deployment lifecycle to reflect that destruction is in progress.
- System stops future per-agent billing for a deployment once the live instance is destroyed.
- If the deleted snapshot is tied to a published app store template, the platform warns the publisher before deletion that the template is being discontinued.
- If buyers already use the published snapshot, the platform notifies affected buyers that the publisher is discontinuing support for that snapshot and that their current copy will no longer receive support.
- Existing buyer deployments created from the snapshot remain available to those buyers, but the listing is marked discontinued for future support expectations.
- System removes or archives access details once the deployment is destroyed.
- Deleted deployments no longer appear as active running environments in the dashboard.
- Deleted snapshots no longer appear as deployable assets in the publisher's library.

Happy Flow:
1. The subscriber opens the asset or detail page for an existing snapshot.
2. The subscriber clicks `Delete Snapshot`.
3. ClawBuilder detects that the snapshot is tied to a published app store template with existing buyers.
4. The platform presents a confirmation prompt explaining that the template will be discontinued and that affected buyers will be notified their current copy will no longer receive publisher support.
5. The subscriber confirms the deletion.
6. The platform marks the published listing as discontinued and sends notifications to affected buyers.
7. ClawBuilder removes the snapshot from the publisher's deployable assets and support catalog.
8. Buyers keep their existing deployed copy, but the platform shows that publisher support for that snapshot has ended.

---

## US-009: Connect a Seller Payout Account with Stripe
Actor: Template Seller
Status: `Planned`
Current Codebase Note: No Stripe Connect onboarding, connected-account persistence, payout readiness tracking, or seller payout schema exists in the current codebase.

As a Template Seller, I want to connect a payout account through Stripe Connect, so that I can receive money from app store sales into my bank account without ClawBuilder directly handling my bank account details.

Acceptance Criteria:
- Seller can start payout onboarding from an authenticated ClawBuilder account.
- Platform creates or links a Stripe Connect account for the seller.
- Seller can provide bank account and payout details through Stripe-hosted or embedded Stripe onboarding.
- ClawBuilder does not require the seller to store raw bank account numbers directly in the platform database.
- Platform shows whether the seller is payout-ready, still onboarding, or blocked by missing Stripe requirements.
- Seller cannot publish a paid app store listing until Stripe payout onboarding is complete and payouts are enabled.

Happy Flow:
1. The seller signs in to ClawBuilder and opens the seller payout setup flow.
2. ClawBuilder starts Stripe Connect onboarding for that seller account.
3. The seller is redirected to or shown the Stripe onboarding experience.
4. The seller enters the required identity, business, and bank account payout details in Stripe.
5. Stripe completes verification and returns the seller to ClawBuilder.
6. ClawBuilder stores the seller's Stripe Connect account reference and payout status.
7. The platform marks the seller as payout-ready for marketplace sales.
8. The seller can now create paid app store listings that route proceeds through Stripe.

---

## US-010: Publish a Snapshot to the App Store
Actor: Template Seller
Status: `Planned`
Current Codebase Note: No app store listing model, seller publishing route, marketplace moderation flow, or paid listing workflow exists in the current routes or database schema.

As a Template Seller, I want to publish my own snapshot to the app store as a paid template listing, so that other users can purchase and deploy my preconfigured OpenClaw setup.

Acceptance Criteria:
- Seller can select an owned snapshot as the basis for an app store listing.
- Seller can enter listing details such as name, description, provider compatibility, and price.
- System validates that the seller can only publish snapshots owned by that account.
- Seller must have a payout-ready Stripe Connect account before the paid listing can go live.
- Published listings become discoverable in the app store for eligible buyers.
- Stripe Connect is used to route seller proceeds and the platform fee for paid sales on the platform.

Happy Flow:
1. The seller signs in to ClawBuilder with an active subscriber account and completed Stripe payout onboarding.
2. The seller opens the app store publishing flow.
3. The platform shows snapshots owned by the seller that are eligible for listing.
4. The seller chooses a snapshot and enters the listing title, description, supported providers, and price.
5. ClawBuilder validates the listing details, the seller's ownership of the snapshot, and the seller's payout-ready Stripe status.
6. The seller submits the listing for publication.
7. The platform creates the paid app store entry and configures future sales to route the seller share through Stripe Connect.
8. The listing appears in the app store for other users to browse and purchase.

---

## US-011: Purchase a Template from the App Store
Actor: Template Buyer
Status: `Planned`
Current Codebase Note: No marketplace browsing UI, Stripe checkout flow, purchase ledger, or seller proceeds routing exists in the current application.

As a Template Buyer, I want to browse app store listings, buy a template through Stripe, and add it to my deployable library, so that I can quickly launch OpenClaw setups created by other users.

Acceptance Criteria:
- Buyer can browse and review available app store listings.
- Each listing presents enough information for the buyer to evaluate the template before purchase.
- Buyer can complete template purchases through Stripe.
- Purchased templates are added to the buyer's account as deployable options after payment succeeds.
- System records the transaction so the purchase appears in platform history for both buyer and seller.
- Platform routes the seller proceeds to the seller's Stripe Connect account and retains the platform fee in the same transaction flow.

Happy Flow:
1. The buyer opens the ClawBuilder app store.
2. The buyer browses available template listings and opens one that looks relevant.
3. The platform shows the template details, price, and supported provider information.
4. The buyer clicks `Buy Template`.
5. ClawBuilder sends the buyer into the Stripe checkout flow for that listing.
6. The buyer completes the purchase successfully.
7. Stripe confirms the transaction to ClawBuilder and allocates the seller proceeds through Stripe Connect.
8. The purchased template is added to the buyer's deployable library for future use.

---

## US-012: Redeploy a Purchased Template and Review Transactions
Actor: Subscriber
Status: `Planned`
Current Codebase Note: No purchased-template library, marketplace redeploy flow, or consolidated billing and transaction history screen exists in the current product.

As a Subscriber, I want to redeploy a purchased marketplace template and review my Stripe-backed per-agent subscriptions, purchases, and sales transactions, so that I can reuse what I bought and track all platform billing activity in one place.

Acceptance Criteria:
- Subscriber can select a previously purchased marketplace template for redeployment.
- Subscriber can redeploy the purchased template to a supported provider.
- System preserves a record of recurring per-live-deployment subscription charges, template purchases, and template sales tied to the account.
- Subscriber can distinguish incoming sales activity from outgoing live-agent subscription charges and purchase charges.
- Billing records identify which live deployment each recurring agent charge belongs to.
- Transaction history aligns with Stripe-backed billing records shown by the platform.

Happy Flow:
1. The subscriber opens the deploy flow after previously purchasing a marketplace template.
2. The platform shows the purchased template in the subscriber's deployable library.
3. The subscriber selects the purchased template and chooses `BytePlus` as the provider.
4. ClawBuilder confirms the redeployment summary and starts provisioning.
5. The platform creates a new deployment from the purchased template snapshot and marks it billable once it goes live.
6. The subscriber opens the billing or transactions area from the account section.
7. ClawBuilder displays recurring live-agent subscription charges by deployment, app store purchases, and app store sales associated with the account.
8. The subscriber confirms both the redeployment and the related Stripe-backed transaction records.
