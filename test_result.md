#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
## user_problem_statement: |
  Apply the fixes from the product/design audit of Sunshine (SUN-01 … SUN-11):
  the SOS button asserting delivery it never performed, adherence dying on day two,
  new accounts alarming the family, invented relatives, floating buttons covering
  content, a dead accessibility toggle, an unshareable family code, unauthenticated
  AI endpoints, and an unthrottled 4-digit PIN.

## backend:
  - task: "Dated dose ledger replacing the taken_today boolean"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: |
            Adherence now lives in an `intakes` collection, one row per medicine per
            local day with `taken_at`. "taken_today" is derived, never stored, so it
            resets itself at the elder's midnight with no job. Confirming twice is a
            no-op; undoing is an explicit {"taken": false}. Verified: stock moves once
            (6 -> 4 across two confirms), and an intake dated to a past day no longer
            counts as today's.

  - task: "Elder-local timezone, no seeded demo data, alerts gated on a real intake"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: |
            Elders store an IANA timezone captured from the device at signup
            (default Asia/Kolkata); every schedule, greeting and day boundary is
            computed in it. `_seed_elder_data` deleted — new accounts start empty
            and the app opens on the prescription-scan empty state. A medicine only
            becomes alertable after its first confirmed intake, so a newly added
            medicine cannot alarm the family. Location is no longer hardcoded to
            Bengaluru. Verified: a fresh account shows zero medicines, zero
            appointments and zero alerts on both sides.

  - task: "Honest SOS, real family graph, missed-dose sweep off the read path"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: |
            /sos resolves contacts from the family graph, writes a notification per
            contact, and returns {delivered, contacts_notified, emergency_number}.
            With nobody connected it says so and offers 112 instead of claiming
            "help is on the way". Same for /im-okay. FAMILY_STORIES and the voice
            agent's hardcoded NAMES are gone; /family-stories is replaced by /family.
            Missed-dose notifications moved to a 15-minute background sweep, so GET
            handlers no longer write. Verified end to end: alone -> delivered=false;
            after a child joins -> delivered=true, contacts=["Priya Sharma"].

  - task: "Auth on AI endpoints, PIN throttling, scoped image tokens"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: |
            /assistant/chat, /assistant/history and /voice/ask now require auth, and
            chat history is scoped to the authenticated user (a guessed session id
            returns nothing; hijacking one 403s). Elder PIN login backs off after 5
            failures with a 15-minute lockout. JWT default cut from 30 days to 7.
            Prescription images prefer the Authorization header; the query-string
            fallback is a 10-minute token scoped to `prescription_image`, and
            current_user rejects any scoped token so it cannot be replayed as a
            session.

## frontend:
  - task: "Working text-size setting and applied type tokens"
    implemented: true
    working: true
    file: "frontend/src/text-scale.tsx, frontend/src/components/AppText.tsx, frontend/src/theme.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: |
            The dead "Larger text" switch is replaced by a persisted three-step
            control (Normal / Large / Largest). AppText scales whatever size a style
            declares, so all 15 screens scale together. theme.ts now carries the real
            type scale. Verified by screenshot: selecting Largest visibly enlarges
            every element on the screen.

  - task: "Floating buttons moved into reserved chrome; SOS confirmation"
    implemented: true
    working: true
    file: "frontend/app/(elder)/_layout.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: |
            The assistant and SOS buttons now sit in an opaque action bar above the
            tab bar instead of floating over content. Verified on all four tabs — the
            Watch description and the Health medicine cards are fully readable again,
            and SOS is no longer adjacent to Share. SOS asks "Do you need help?" with
            a cancel before firing, and the result sheet reports only what happened,
            with a one-tap Call 112 button.

  - task: "Real family data, invite sharing, deep link"
    implemented: true
    working: true
    file: "frontend/app/(elder)/index.tsx, frontend/app/(elder)/profile.tsx, frontend/app/join.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: |
            The invented Family Updates ring and Stay Connected contacts are gone,
            replaced by the real family graph with invite empty states. The family
            code now has Invite (share sheet) and Copy buttons, and the invite carries
            a sunshine://join?code=... deep link that pre-fills child signup.

  - task: "Accessibility labels across all interactive controls"
    implemented: true
    working: true
    file: "frontend/app/**"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: |
            Went from zero accessibility props to ~96 across 11 screens: roles, labels
            and hints on every icon-only control (SOS, assistant, medicine checkboxes,
            keypad, reels rail, call controls, task actions), plus live regions on
            errors, toasts and the family alert box.

## metadata:
  created_by: "main_agent"
  version: "2.0"
  test_sequence: 1
  run_ui: false

## test_plan:
  current_focus:
    - "Dated dose ledger replacing the taken_today boolean"
    - "Honest SOS, real family graph, missed-dose sweep off the read path"
    - "Auth on AI endpoints, PIN throttling, scoped image tokens"
  stuck_tasks: []
  test_all: true
  test_priority: "high_first"

## agent_communication:
    - agent: "main"
      message: |
        Applied all 11 audit findings. Verification run locally: 58/58 API assertions
        pass, tsc clean, eslint clean, `expo export --platform web` succeeds, and both
        roles were driven through Chromium with zero runtime errors.

        Caveat for the testing agent: the LLM calls could not be exercised here —
        `emergentintegrations` and `litellm` are private wheels this environment
        cannot reach, so OCR, concierge classification and the voice agent ran against
        a stub. Their routing, persistence, auth and error paths are covered; only the
        model's own wording is unverified. Please re-run those against the preview URL.

        Two contract changes the suite depends on:
        1. POST /health/medicines/{id}/take takes an optional {"taken": bool}. It is
           idempotent — a second confirm no longer undoes the dose.
        2. GET /family-stories is removed; GET /family returns the real members.
        Existing tests in backend/tests were updated for both, plus auth headers on
        the assistant endpoints and the removal of the invented Priya/Rahul cast.

#====================================================================================================
# Voice agent feature pass
#====================================================================================================

## user_problem_statement: |
  Check whether four voice-agent features are present and working, and make them
  work if not: (1) family voice notes, (2) adding a medicine by speaking it,
  (3) a spoken "yes, do it" confirmation before calls and SOS, (4) Sunshine
  reading its replies aloud.

## backend:
  - task: "Family voice notes — record, store, deliver, play"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: false
          agent: "main"
          comment: |
            AUDIT: the agent returned a voice_note action and replied "Record your
            voice note now", but there was no storage endpoint and no recorder UI.
            Nothing was ever recorded or delivered — a dead end.
        - working: true
          agent: "main"
          comment: |
            Added POST /family/voice-notes (multipart, 10 MB cap, recipient must be a
            really-connected family member), GET /family/voice-notes (elders see sent,
            family sees received) and GET /family/voice-notes/{id}/audio, which marks
            the note heard on first play and writes a notification for the recipient.
            Verified: send -> appears unheard in the family inbox -> plays -> marked
            heard; cross-family fetch returns 404.

  - task: "Spoken yes/no confirmation endpoint"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: false
          agent: "main"
          comment: |
            AUDIT: the backend set confirm:true and the reply said "Tap Yes to
            confirm", but the app had no confirm step — it navigated straight into
            the call, and a voice-raised SOS was dropped entirely.
        - working: true
          agent: "main"
          comment: |
            Added POST /agent/confirm, which transcribes a short reply and classifies
            it. The classifier is deliberately conservative — it accepts English and
            Hindi yes/no forms ("haan ji", "nahi") and returns null for anything
            ambiguous, so an unclear answer re-asks rather than raising an alert.

  - task: "Text-to-speech for agent replies"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        - working: false
          agent: "main"
          comment: "AUDIT: no TTS endpoint existed; the client class was imported and never used."
        - working: true
          agent: "main"
          comment: |
            Added POST /agent/speak (synthesizes, caches, returns an id + media token)
            and GET /agent/speech/{id}, so the player streams the audio instead of
            buffering it through JavaScript. A background sweep drops cached speech
            after 30 minutes.

            NEEDS RETESTING ON THE PREVIEW: this repo never called OpenAITextToSpeech,
            so its method name is not pinned anywhere. _synthesize() probes
            generate_speech / synthesize / speak / create / generate / text_to_speech
            in turn and uses whichever the installed wheel exposes, logging the ones
            that fail. Verified here against a stub only. If none matches, the
            endpoint returns 502 and the app stays usable — speech is an enhancement,
            the reply is already on screen.

## frontend:
  - task: "Voice note recorder in the assistant, inbox on the family dashboard"
    implemented: true
    working: true
    file: "frontend/app/assistant.tsx, frontend/app/(child)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: |
            Asking for a voice note opens a record/send sheet naming the real
            recipient. The family dashboard gained a Voice notes section with play
            buttons and a "New" badge for unheard notes.

  - task: "Confirmation sheet with tap and voice answers"
    implemented: true
    working: true
    file: "frontend/app/assistant.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: |
            Calls and SOS raised by the agent are now held in a confirmation sheet
            with "Yes, do it", "Answer by voice" and "No, cancel". Verified that no
            SOS notification reaches the family until the elder confirms.

  - task: "Sunshine reads replies aloud"
    implemented: true
    working: true
    file: "frontend/src/hooks/use-speech.ts, frontend/app/assistant.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        - working: true
          agent: "main"
          comment: |
            Every reply is spoken automatically, with a speaker toggle in the header
            that is remembered between sessions. A newer reply cancels an older one
            still being fetched. Playback path needs a device check once the real
            TTS wheel is available.

## metadata:
  created_by: "main_agent"
  version: "2.1"
  test_sequence: 2
  run_ui: false

## test_plan:
  current_focus:
    - "Text-to-speech for agent replies"
    - "Sunshine reads replies aloud"
    - "Family voice notes — record, store, deliver, play"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

## agent_communication:
    - agent: "main"
      message: |
        Audited the four requested features first. Only "medicine by voice" already
        worked — it was creating the medicine server-side correctly. The other three
        were partial or absent and have been built:

        - Voice notes had an intent and a reply but no recorder, no storage and no
          way for the family to listen. Now end to end.
        - Confirmation existed only as backend intent (confirm:true) and reply text;
          the app fired calls immediately and ignored voice-raised SOS. Now a sheet
          with tap or spoken yes/no.
        - Text-to-speech did not exist at all. Now synthesized server-side and played
          in the app, with a remembered on/off toggle.

        Verification: 19/19 new feature assertions, 58/58 earlier regression
        assertions, tsc + eslint clean, web export succeeds, driven in Chromium with
        zero runtime errors.

        Please prioritise the two items marked needs_retesting — both depend on the
        real emergentintegrations TTS wheel, which this environment cannot reach.
        Also note: the "Priya or Rahul" contacts from the original spec no longer
        exist as built-ins. Voice notes and calls resolve against whoever has
        actually joined with the family code, so a test account needs a connected
        child before those intents will produce an action.

#====================================================================================================
# Medicine removal, step tracking, and expanded AI
#====================================================================================================

## user_problem_statement: |
  (1) Add a way to remove a medicine from the Health page, beside each medicine.
  (2) Show the number of steps taken today, opening into best weekly stats, using
  the phone's own activity data. (3) Audit where Gemini is integrated, recommend
  where else it would help, and add it there.

## AI integration map (before this change):
  - Gemini 3.1 Pro   -> prescription photo OCR (_ocr_extract)
  - Gemini 3.1 Pro   -> older chat assistant (assistant_chat)
  - Gemini 2.5 Flash -> voice agent intent routing (_run_agent)
  - GPT-5.4-mini     -> concierge request classification
  - GPT-5.4-mini     -> reel question answering (voice_ask)
  - GPT-5.4-mini     -> call/message intent detection (_detect_action)
  - Whisper          -> speech to text
  - OpenAI TTS       -> spoken replies

## backend:
  - task: "Remove a medicine and everything attached to it"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: |
            DELETE /health/medicines/{id} removes the medicine, its dose ledger, its
            missed-dose notifications, and withdraws any open auto-generated reorder
            request. Verified: a deleted medicine cannot keep alerting, the family's
            reorder queue is cleaned up, a second delete is a clean 404, and another
            family cannot delete it.

  - task: "Daily and weekly step tracking"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: |
            POST /health/steps upserts a day's total (highest reading wins, since the
            phone reports a running count) and GET /health/steps?days=7 returns the
            week in the elder's own zone with zeros for missing days, plus best day,
            average over active days, and goal-days. Family can read it; only the
            elder can write it. Verified with a seeded week: totals, best day,
            average, malformed-day rejection and role separation all correct.

  - task: "Gemini medicine explainer"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: true
          agent: "main"
          comment: |
            POST /health/medicines/{id}/explain answers "what is this for?" in plain
            language for one of the elder's own medicines. Prompt forbids dose advice
            and diagnosis; the response always carries a not-medical-advice notice.
            An unparseable or empty answer is reported as "unknown" rather than a
            blank card. Answers are cached by medicine name so repeat opens are free.
            NEEDS RETESTING against the real Gemini model for answer quality and
            safety wording — verified here against a stub.

  - task: "Gemini weekly family summary"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        - working: true
          agent: "main"
          comment: |
            GET /child/weekly-summary turns the week's real figures (doses confirmed
            and missed, low stock, steps, active days, app opens, completed requests)
            into a headline, two or three sentences and an optional suggestion. The
            prompt is instructed to use only the supplied figures and never invent an
            event or a symptom; the figures are returned alongside the prose so the
            family can check it. Falls back to a plain generated sentence if the model
            is unavailable. NEEDS RETESTING for faithfulness against real data.

## frontend:
  - task: "Medicine row actions: explain and remove"
    implemented: true
    working: true
    file: "frontend/app/(elder)/health.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: |
            Each medicine row gained a "?" explainer and a red remove button, placed
            outside the confirm target so neither is a mis-tap for the other. Removal
            asks first and states plainly that reminders and dose history go with it.

  - task: "Step counter and weekly chart"
    implemented: true
    working: true
    file: "frontend/src/hooks/use-steps.ts, frontend/app/(elder)/health.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: true
          agent: "main"
          comment: |
            Health opens with today's steps and progress toward a goal; tapping it
            shows a seven-day bar chart with the best day highlighted, plus best day,
            daily average and goal-days. iOS is asked for today's count directly;
            Android counts forward from launch and adds it to the day's stored total,
            which is why totals are synced to the backend. Degrades honestly where
            there is no pedometer (web) — it says so and still shows the history.
            NEEDS DEVICE TESTING: the pedometer path cannot run in a browser, so iOS
            historical reads and Android live watching are unverified. Motion
            permissions are declared in app.json (NSMotionUsageDescription,
            ACTIVITY_RECOGNITION).

  - task: "Weekly summary and walking on the family dashboard"
    implemented: true
    working: true
    file: "frontend/app/(child)/index.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: |
            The dashboard now leads with the plain-language weekly read and gained a
            walking tile. Both load after the main payload so they never delay it.

## metadata:
  created_by: "main_agent"
  version: "2.2"
  test_sequence: 3
  run_ui: false

## test_plan:
  current_focus:
    - "Gemini medicine explainer"
    - "Gemini weekly family summary"
    - "Step counter and weekly chart"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

## agent_communication:
    - agent: "main"
      message: |
        25/25 new assertions pass, plus 58/58 and 19/19 on the earlier suites — 102
        in total. tsc and eslint clean, web export succeeds, both roles driven in
        Chromium with zero runtime errors.

        Three things need testing where I could not:
        1. The pedometer needs a real device; browsers have no step sensor. The UI
           path for "no sensor" is verified, the sensor path is not.
        2. Both new Gemini features ran against a stub. Please check answer quality
           and, for the explainer, that the model holds the line on not giving dose
           advice.
        3. New medicines added by an elder now have no image (MED_IMAGES still keys
           off type, so this is unchanged) — worth a look on a real device.

#====================================================================================================
# Two-track fulfilment, notifications, photo galleries, and demo data
#====================================================================================================

## user_problem_statement: |
  (1) Every concierge action should offer two routes after tapping: ask the family,
  or have the human-in-the-loop AI agent do it. When the agent completes it the app
  places the order and the child is asked to pay the invoice — and the same must work
  by voice. (2) Notifications in both directions plus app-generated ones, e.g. when a
  voice note or photo is sent. (3) Tapping a family member's photo shows their past
  shared photos and photos of them from the phone library. (4) No button should return
  a blank screen; seed sample data for presentation while keeping real upload intact.

## backend:
  - task: "Two-track fulfilment with human-in-the-loop ordering and invoices"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: |
            POST /concierge/tasks/{id}/assign routes a request to "family" or
            "concierge". The concierge track has Gemini draft priced line items, but
            deliberately stops there: status is agent_arranging / awaiting_operator and
            no invoice exists. POST .../place-order is the human half — it records that
            a person placed the order, raises an invoice and asks the family to pay.
            POST /concierge/invoices/{id}/pay settles it and closes the request. A
            zero-total order is rejected so an unpriced draft can never become a
            payment request. Verified across the whole chain including role checks.

  - task: "Two-way notification bus and inbox"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: |
            One notification shape for everything, addressed per user, with
            GET /notifications, per-item read and read-all. Emitted on voice notes,
            photos, task assignment, invoices, payment, SOS, I'm okay, missed doses and
            a family member joining. SOS and missed-dose alerts were migrated onto it.
            Voice notes are now bidirectional — a child's note goes to the parent, and
            either side can play a note they sent or received.

  - task: "Family photo sharing"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: |
            POST /family/photos (both directions), GET /family/photos with an optional
            member filter, streamed images behind the media token, and delete limited
            to whoever shared it. Verified including cross-family isolation.

  - task: "Demo data seeding"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: |
            Behind DEMO_MODE (default on). New elder accounts are seeded with three
            medicines carrying a week of dose history, two appointments, a week of
            steps, four captioned photos, and two requests — one settled with a paid
            invoice, one awaiting payment with priced line items. Every record is
            tagged demo=True.

            Two properties matter and are both tested: the seed never fires a false
            missed-dose alert (medicines are seeded with real intake history, so the
            existing gate behaves normally), and DELETE /demo/seed removes only tagged
            records — a medicine the user really added survives. Real upload paths are
            untouched; sample photos carry an external_url while real ones stream from
            object storage.

            IMPORTANT FOR TESTING: the API suites assert the empty-account behaviour
            and must run with DEMO_MODE=0. With seeding on they will legitimately fail.

## frontend:
  - task: "Assignment choice on every concierge action, by tap and by voice"
    implemented: true
    working: true
    file: "frontend/app/(elder)/health.tsx, frontend/app/assistant.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: |
            Tapping any Care & Concierge action now opens "Who would you like to take
            care of this?" with the family option naming who will be told and the
            Sunshine option stating the cost is approved first. The same sheet appears
            in the assistant when a request is spoken, and the agent honours it
            directly if she says who should do it.

  - task: "Notification inbox with unread badges"
    implemented: true
    working: true
    file: "frontend/app/notifications.tsx, frontend/src/hooks/use-notifications.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: |
            A shared Updates screen with per-kind icons and tone, plus a bell with an
            unread badge on both home screens. Family dashboard also gained a
            "Waiting for payment" panel with a one-tap Pay button.

  - task: "Per-person photo gallery"
    implemented: true
    working: true
    file: "frontend/app/family/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: true
          agent: "main"
          comment: |
            Tapping a family member opens their shared photos in a grid with a viewer,
            plus a "From this phone" section backed by expo-media-library that shares
            a device photo in one tap.

            SCOPE NOTE: the request was for "all photos of that person in the phone
            library". Neither iOS nor Android exposes per-person albums to an app, so
            face matching is not possible without shipping recognition of our own.
            The section therefore shows recent device photos and says so in plain
            words rather than implying it has filtered by face. NEEDS DEVICE TESTING —
            the media library cannot run in a browser.

  - task: "No dead buttons"
    implemented: true
    working: true
    file: "frontend/app/(elder)/content.tsx, frontend/app/(child)/profile.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: |
            Audited every Pressable for a missing onPress. Two were dead: the reel
            Share button (now opens the share sheet) and the four rows on the family
            profile (now go to Updates, Requests & payments, the photo gallery, and a
            help sheet). No Pressable in the app is now without an action.

## metadata:
  created_by: "main_agent"
  version: "2.3"
  test_sequence: 4
  run_ui: false

## test_plan:
  current_focus:
    - "Per-person photo gallery"
    - "Demo data seeding"
    - "Two-track fulfilment with human-in-the-loop ordering and invoices"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

## agent_communication:
    - agent: "main"
      message: |
        133 assertions pass in total: 31 fulfilment/notification/photo, 22 demo
        seeding, 25 medicine-and-steps, 19 voice agent, 36 core. tsc and eslint clean,
        web export succeeds, both roles driven in Chromium with zero runtime errors.

        Run the API suites with DEMO_MODE=0 — they assert empty-account behaviour and
        will fail against a seeded account by design.

        On the ordering flow: the model drafts and prices the order but never places
        it. place-order is a separate call representing a real person acting, so the
        elder is never told an order exists until one does. Wiring an actual pharmacy
        or taxi API, and a real payment provider, are the two integrations still
        outstanding — paying an invoice currently records settlement, it does not move
        money.
