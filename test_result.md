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
