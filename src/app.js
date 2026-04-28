"use strict";

//JS
import { d2Get, d2PostPlain, d2Delete } from "./js/d2api.js";
import Choices from "choices.js";
import M from "materialize-css";
import pLimit from "p-limit";

//CSS
import "./css/style.css";
import "materialize-css/dist/css/materialize.min.css";
import "choices.js/public/assets/styles/choices.min.css";
import { loadLegacyHeaderBarIfNeeded } from "./js/check-header-bar.js";


let unusedVariablesFilter;

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));

document.addEventListener("DOMContentLoaded", async function () {
    loadLegacyHeaderBarIfNeeded();
    const programs = await d2Get("api/programs.json?fields=name,id&paging=false");
    const programChoices = new Choices("#programDropdown", {
        choices: programs.programs.map(program => ({ value: program.id, label: program.name })),
        searchEnabled: true,
        placeholder: true,
        placeholderValue: "Programme(s) to validate",
        searchPlaceholderValue: "Search programmes",
        removeItemButton: true
    });

    const tabs = document.querySelectorAll(".tabs");
    M.Tabs.init(tabs);

    const validateSelectedButton = document.getElementById("validateSelectedButton");
    const validateAllButton = document.getElementById("validateAllButton");
    const progressContainer = document.querySelector(".progress-container");

    const deleteSelectedButton = document.getElementById("deleteSelectedButton");
    deleteSelectedButton.disabled = true;
    deleteSelectedButton.addEventListener("click", deleteSelectedVariables);

    // Enable/disable delete button based on checkbox selection
    document.getElementById("unusedVariablesTable").addEventListener("change", function () {
        const checkboxes = document.querySelectorAll("#unusedVariablesTable .variable-checkbox:checked");
        deleteSelectedButton.disabled = checkboxes.length === 0;
    });

    // Enable validate buttons based on program selection
    document.getElementById("programDropdown").addEventListener("change", function () {
        const selectedProgramIds = programChoices.getValue(true);
        validateSelectedButton.disabled = selectedProgramIds.length === 0;
    });

    validateSelectedButton.onclick = function () {
        const selectedProgramIds = programChoices.getValue(true);
        validateSelectedButton.disabled = true;
        validateAllButton.disabled = true;
        deleteSelectedButton.disabled = true;
        progressContainer.style.display = "block";
        validateProgramRules(selectedProgramIds).finally(() => {
            validateSelectedButton.disabled = false;
            validateAllButton.disabled = false;
            progressContainer.style.display = "none";
        });
    };

    validateAllButton.onclick = function () {
        validateSelectedButton.disabled = true;
        validateAllButton.disabled = true;
        deleteSelectedButton.disabled = true;
        progressContainer.style.display = "block";
        validateProgramRules().finally(() => {
            validateSelectedButton.disabled = false;
            validateAllButton.disabled = false;
            progressContainer.style.display = "none";
        });
    };

    unusedVariablesFilter = new Choices("#unusedVariablesFilter", {
        searchEnabled: true,
        placeholder: true,
        placeholderValue: "Filter by Programme",
        searchPlaceholderValue: "Search programmes",
        removeItemButton: true,
        shouldSort: false,
        duplicateItemsAllowed: false
    });

    // Event listeners to filter tables based on selected programs
    unusedVariablesFilter.passedElement.element.addEventListener("change", filterUnusedVariablesTable);
});


function stripStringLiterals(expression) {
    return expression.replace(/(["'])(?:\\.|[^\\])*?\1/g, "");
}

function extractPRVsFromD2HasValue(expression) {
    const matches = [];
    const regex = /d2:hasValue\s*\(\s*["']([^"']+)["']\s*\)/g;
    let match;
    while ((match = regex.exec(expression)) !== null) {
        matches.push(match[1]);
    }
    return matches;
}

function filterUnusedVariablesTable() {
    const selectedProgramIds = Array.from(document.getElementById("unusedVariablesFilter").selectedOptions).map(option => option.value);
    const rows = document.querySelectorAll("#unusedVariablesTable tbody tr");
    if (selectedProgramIds.length === 0) {
        rows.forEach(row => row.style.display = "");
    } else {
        rows.forEach(row => {
            const programId = row.cells[1].dataset.programId;
            row.style.display = selectedProgramIds.includes(programId) ? "" : "none";
        });
    }
}

async function processRule(program, rule, prvs) {
    const programId = program.id;
    const usedVariableNames = new Set();
    const invalidConditionExpressions = [];
    const invalidActionExpressions = [];

    const recordUsage = (texts, hasValueSources) => {
        const hasValuePRVs = new Set(hasValueSources.flatMap(extractPRVsFromD2HasValue));
        const cleanTexts = texts.map(stripStringLiterals);
        for (const prv of prvs) {
            const ref1 = `#{${prv.name}}`;
            const ref2 = `A{${prv.name}}`;
            const usedInCurly = cleanTexts.some(t => t.includes(ref1) || t.includes(ref2));
            const usedInHasValue = hasValuePRVs.has(prv.name);
            if (usedInCurly || usedInHasValue) {
                usedVariableNames.add(prv.name);
            }
        }
    };

    if (rule.condition) {
        recordUsage([rule.condition], [rule.condition]);
        try {
            const res = await d2PostPlain(
                `api/programRules/condition/description?programId=${programId}`,
                rule.condition,
            );
            if (!res.ok || res.status === "ERROR") {
                invalidConditionExpressions.push(res.description || res.message || "Condition validation failed");
            }
        } catch {
            invalidConditionExpressions.push("Condition validation error");
        }
    }

    for (const action of (rule.programRuleActions ?? [])) {
        recordUsage([action.content || "", action.data || ""], [action.content || "", action.data || ""]);
        if (action.data) {
            try {
                const res = await d2PostPlain(
                    `api/programRuleActions/data/expression/description?programId=${programId}`,
                    action.data,
                );
                if (!res.ok || res.status === "ERROR") {
                    invalidActionExpressions.push(res.description || res.message || "Invalid action expression");
                }
            } catch {
                invalidActionExpressions.push("Action expression validation error");
            }
        }
    }

    return { program, rule, invalidConditionExpressions, invalidActionExpressions, usedVariableNames };
}

function appendInvalidExpressionRow(tbody, program, rule, msg, ruleLink) {
    const row = tbody.insertRow();
    row.insertCell(0).innerText = program.name;
    row.insertCell(1).innerText = rule.name;
    row.insertCell(2).innerText = rule.id;
    row.insertCell(3).innerText = msg;
    const cell = row.insertCell(4);
    const btn = document.createElement("button");
    btn.className = "btn btn-small";
    btn.innerText = "Maintenance";
    btn.onclick = () => window.open(ruleLink, "_blank");
    cell.appendChild(btn);
}

function appendUnusedVariableRow(tbody, program, variable) {
    const row = tbody.insertRow();
    const selectCell = row.insertCell(0);
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.classList.add("variable-checkbox", "filled-in");
    checkbox.value = variable.id;
    label.appendChild(checkbox);
    label.appendChild(document.createElement("span"));
    selectCell.appendChild(label);
    row.insertCell(1).innerText = program.name;
    row.cells[1].dataset.programId = program.id;
    row.insertCell(2).innerText = variable.name;
    row.insertCell(3).innerText = variable.id;
}

async function validateProgramRules(programIds = null) {
    const selectAllCheckbox = document.getElementById("selectAllCheckbox");
    selectAllCheckbox.onclick = function () {
        const rows = document.querySelectorAll("#unusedVariablesTable tbody tr");
        rows.forEach(row => {
            if (row.style.display !== "none") {
                const checkbox = row.querySelector(".variable-checkbox");
                checkbox.checked = selectAllCheckbox.checked;
            }
        });
        const deleteSelectedButton = document.getElementById("deleteSelectedButton");
        deleteSelectedButton.disabled = document.querySelectorAll("#unusedVariablesTable .variable-checkbox:checked").length === 0;
    };

    try {
        const programs = await d2Get("api/programs.json?fields=name,id&paging=false");

        const unusedVariablesTable = document.getElementById("unusedVariablesTable").querySelector("tbody");
        const invalidActionExpressionsTable = document.getElementById("invalidActionExpressionsTable").querySelector("tbody");
        const invalidConditionExpressionsTable = document.getElementById("invalidConditionExpressionsTable").querySelector("tbody");

        unusedVariablesTable.innerHTML = "";
        invalidActionExpressionsTable.innerHTML = "";
        invalidConditionExpressionsTable.innerHTML = "";

        const progressCombinedBar = document.getElementById("progressCombinedBar");

        let selectedPrograms = programs.programs;
        if (programIds) {
            selectedPrograms = selectedPrograms.filter(program => programIds.includes(program.id));
        }

        unusedVariablesFilter.clearStore();
        unusedVariablesFilter.setChoices(
            selectedPrograms.map(p => ({ value: p.id, label: p.name })),
            "value",
            "label",
            false,
        );

        const programLimit = pLimit(4);
        const ruleLimit = pLimit(10);

        // Phase 1: in parallel, fetch rules + PRVs for each selected program.
        const programData = await Promise.all(selectedPrograms.map(program =>
            programLimit(async () => {
                const [rulesResp, prvsResp] = await Promise.all([
                    d2Get(`api/programRules.json?fields=name,id,condition,programRuleActions[data,content,description]&paging=false&filter=program.id:eq:${program.id}`),
                    d2Get(`api/programRuleVariables.json?fields=name,id,program[id]&paging=false&filter=program.id:eq:${program.id}`),
                ]);
                return {
                    program,
                    rules: rulesResp.programRules,
                    prvs: prvsResp.programRuleVariables,
                };
            })
        ));

        // Phase 2: evaluate every rule across every program in parallel,
        // sharing the rule limit so we don't swamp DHIS2 (max ~14 fetches in
        // flight at peak: programLimit(4) + ruleLimit(10)).
        const totalRules = programData.reduce((n, pd) => n + pd.rules.length, 0);
        let completedRules = 0;
        const updateProgress = () => {
            completedRules++;
            const pct = totalRules > 0 ? (completedRules / totalRules) * 100 : 100;
            progressCombinedBar.style.width = `${pct}%`;
        };

        const ruleResults = await Promise.all(programData.flatMap(({ program, rules, prvs }) =>
            rules.map(rule => ruleLimit(async () => {
                const result = await processRule(program, rule, prvs);
                updateProgress();
                return result;
            }))
        ));

        if (totalRules === 0) {
            progressCombinedBar.style.width = "100%";
        }

        // Phase 3: render result tables. Group by program so rows from one
        // program stay together.
        const usedByProgramId = new Map();
        for (const { program, rule, invalidConditionExpressions, invalidActionExpressions, usedVariableNames } of ruleResults) {
            if (!usedByProgramId.has(program.id)) usedByProgramId.set(program.id, new Set());
            for (const name of usedVariableNames) usedByProgramId.get(program.id).add(name);
            const ruleLink = `../../../dhis-web-maintenance/index.html#/edit/programSection/programRule/${rule.id}`;
            invalidConditionExpressions.forEach(msg => appendInvalidExpressionRow(invalidConditionExpressionsTable, program, rule, msg, ruleLink));
            invalidActionExpressions.forEach(msg => appendInvalidExpressionRow(invalidActionExpressionsTable, program, rule, msg, ruleLink));
        }

        for (const { program, prvs } of programData) {
            const used = usedByProgramId.get(program.id) ?? new Set();
            const unused = prvs.filter(prv => !used.has(prv.name));
            unused.forEach(variable => appendUnusedVariableRow(unusedVariablesTable, program, variable));
        }

        progressCombinedBar.style.width = "100%";
    } catch (error) {
        console.error("Validation failed", error);
    }
}

async function deleteSelectedVariables() {
    try {
        const checkboxes = document.querySelectorAll("#unusedVariablesTable input[type='checkbox']:checked");
        const idsToDelete = Array.from(checkboxes)
            .filter(cb => cb.id !== "selectAllCheckbox")
            .map(cb => cb.value);
        console.log("Ids to delete:", idsToDelete); // Added log for ids to delete
        if (idsToDelete.length === 0) {
            M.toast({ html: escapeHtml("No variables selected for deletion."), classes: "red" });
            return;
        }

        if (!confirm("Are you sure you want to delete selected variables?")) return;

        let successCount = 0;
        let failureCount = 0;

        for (const id of idsToDelete) {
            try {
                await d2Delete(`api/programRuleVariables/${id}`);
                successCount++;
                // Remove the row from the table
                const row = document.querySelector(`#unusedVariablesTable input[value='${id}']`).closest("tr");
                row.remove();
            } catch (error) {
                console.error("Error deleting variable with id:", id, error); // Added specific error logs
                failureCount++;
            }
        }

        if (successCount > 0) {
            M.toast({ html: `Deleted ${escapeHtml(successCount)} variables.`, classes: "green" });
        }
        if (failureCount > 0) {
            M.toast({ html: `Failed to delete ${escapeHtml(failureCount)} variables.`, classes: "red" });
        }

        // Disable delete button if no checkboxes are selected
        const remainingCheckboxes = document.querySelectorAll("#unusedVariablesTable .variable-checkbox:checked");
        const deleteSelectedButton = document.getElementById("deleteSelectedButton");
        deleteSelectedButton.disabled = remainingCheckboxes.length === 0;
    } catch (error) {
        console.error("Deletion failed", error);
        M.toast({ html: escapeHtml("Deletion failed."), classes: "red" });
    }
}


