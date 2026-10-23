# Program Rule Validator Tool { #tool-program-rule-validator }

## What the tool is for { #tool-program-rule-validator-about }

The Program Rule Validator Tool finds program rules whose condition or action expression the server rejects, and program rule variables that no program rule uses. You can delete the unused variables from the tool. It is for system administrators who maintain tracker and event programs.

## Before you start { #tool-program-rule-validator-before-you-start }

The tool supports DHIS2 2.40 and later.

To run a validation, you need to be able to view the programs, program rules and program rule variables that you want to check. To delete variables, you also need the authority to manage program rules (`F_PROGRAM_RULE_MANAGEMENT`). A user with the `ALL` authority has both.

> **Warning**
>
> Deleting a program rule variable cannot be undone. Try the tool on a copy of your database first, and back up the database before you delete variables on a production server.

## Install the tool { #tool-program-rule-validator-install }

The tool is not on the App Hub. You can install it in two ways:

- From the tool-box app, if it is installed on your server.
- From the zip file of a GitHub release, in the **App Management** app.

To install it from a release:

1. Download the `.zip` file of the newest release from the [releases page of the tool](https://github.com/dhis2-utils/tool-program-rule-validator/releases).
2. Open the **App Management** app.
3. Click **Upload app** and choose the `.zip` file.

The tool appears in the app menu as **Program Rule Validator Tool**.

<!-- VERIFY IN APP: the upload control is labelled "Upload app" in App Management on 2.41 to 2.43; check for 2.40. -->

## Validate programs { #tool-program-rule-validator-validate }

A validation sends each program rule condition and each action expression to the server to check. On an instance with thousands of program rules, a run over all programs can take several minutes.

1. Open the **Program Rule Validator Tool**.
2. In **Programs to validate**, choose one or more programs. Type in the filter box to search by name.
3. Click **Validate selected**. To check every program instead, click **Validate all**.

A progress bar shows how far the run has got. To stop a run, click **Cancel**. When the run is complete, the results appear in three tabs:

- **Invalid conditions** lists program rules whose condition the server rejects, with the server's message.
- **Invalid actions** lists program rule actions whose expression the server rejects.
- **Unused program variables** lists program rule variables that no program rule in the same program uses.

If you cancel a run, or it fails, the results of the last complete run stay on the screen. A notice says that they are from that run.

If the server does not answer for some expressions, for example because of a server error or a lost connection, the tool tries again. Expressions that still have no answer are not listed as invalid. A warning above the tabs gives their number instead. Run the validation again to check them.

## Fix an invalid rule { #tool-program-rule-validator-fix }

Each row in the results has an **Edit** button. It opens the program rule or variable in a new tab, in the **Metadata Management** app when you can open it, or else in the **Maintenance** app. The tooltip of the button says which app it opens. If you can open neither app, the row has no button.

1. In the results, click **Edit** on the row.
2. Correct the expression in the app that opens, and save it.
3. Return to the tool and run the validation again.

## Delete unused variables { #tool-program-rule-validator-delete }

> **Warning**
>
> The tool deletes the variables from the server at once, and you cannot undo it. Check each variable before you delete it, in particular if other systems or scripts refer to it by name.

1. Click the **Unused program variables** tab.
2. Optional: in **Filter by program**, choose the programs whose variables you want to see.
3. Choose the checkbox of each variable to delete, or the checkbox in the header row to choose every variable in the list.
4. Click **Delete selected**.
5. In the dialog, click **Delete**.

A message says how many variables were deleted, and the deleted variables leave the list. If some could not be deleted, a second message gives their number, and they stay in the list.

## Known limitations { #tool-program-rule-validator-limitations }

- The tool checks expressions with the server's own expression check. A rule can pass that check and still not do what you want, for example when it assigns a value to the wrong data element.
- The server's check does not know every function that program rules can use. It rejects `d2:countIfCondition`, for example, so a rule that uses it is listed as invalid even though it runs in the apps that use program rules.
- Only the condition and the action expression (the **data** field) are checked. Text in an action's content field is not.
- A variable counts as used when any rule in its program refers to it as `#{name}`, as `A{name}`, or by its name in quotes, as in `d2:hasValue('name')` or `d2:count('name')`. A variable whose name appears only in quotes as plain text, for example in `#{status} == 'name'`, therefore counts as used and is not listed. The tool errs this way so that it never offers to delete a variable that a rule needs.
- The tool looks only at program rules. It does not check scripts, integrations or other systems that refer to a variable by name.
- Variables are deleted one at a time. Deleting several hundred can take a few minutes.
