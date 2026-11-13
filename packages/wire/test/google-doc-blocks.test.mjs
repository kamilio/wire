import assert from "node:assert/strict";
import test from "node:test";
import { nativeDocMarkdownEqual } from "../../provider-google-docs/dist/native-docs.js";
import { docBlocks, docChanges, mergeDocBlocks } from "../../provider-google-docs/dist/doc-blocks.js";

test("block merging keeps independent changes to adjacent paragraphs and nested bullets", () => {
  const base = "# Title\n\n* Parent\n  * First child\n    * Grandchild\n  * Other child\n";
  const remote = base.replace("First child", "Remote child").replace("Title", "New title");
  const local = base.replace("Grandchild", "Revised grandchild").replace("Other child", "Local child");
  const expected = remote.replace("Grandchild", "Revised grandchild").replace("Other child", "Local child");
  assert.equal(mergeDocBlocks(base, local, remote), expected);
  assert.equal(mergeDocBlocks(base, remote, local), expected);
});

test("block merging retains remotely inserted and deleted paragraphs beside a local edit", () => {
  const base = "Intro\nA\nB\nC\n";
  assert.equal(mergeDocBlocks(base, "Intro\nA\nNew B\nC\n", "New intro\nAdded\nA\nB\n"), "New intro\nAdded\nA\nNew B\n");
  assert.equal(mergeDocBlocks(base, base.replace("A\n", "Inserted\nA\n"), base.replace("A\n", "New A\n")), "Intro\nInserted\nNew A\nB\nC\n");
});

test("overlapping changes, including competing inserts and ambiguous repeated deletions, cannot merge", () => {
  const base = "A\nB\nC\n";
  for (const [local, remote] of [
    ["A\nNew B\nC\n", "A\nOther B\nC\n"],
    ["A\nC\n", "A\nOther B\nC\n"],
    ["A\nX\nB\nC\n", "A\nY\nB\nC\n"],
  ]) assert.throws(() => mergeDocBlocks(base, local, remote), /changed remotely and locally/);
  assert.throws(() => mergeDocBlocks("A\nsame\nsame\nZ\n", "A\nchanged\nsame\nZ\n", "A\nsame\nZ\n"), /changed remotely and locally/);
  assert.throws(() => mergeDocBlocks(base, "A\nNew B\nC\n", "A\nB\nB\nC\n"), /changed remotely and locally/);
  assert.equal(mergeDocBlocks(base, "A\nX\nB\nNew C\n", "A\nX\nB\nC\n"), "A\nX\nB\nNew C\n");
});

test("fenced code and tables are each one indivisible block", () => {
  const code = "````ts\na\n```\nb\n````\n", table = "| A |\n| --- |\n| B |\n";
  const base = code + "\n" + table + "Tail";
  assert.deepEqual(docBlocks(base), [code, "\n", table, "Tail"]);
  assert.throws(() => mergeDocBlocks(base, base.replace("\na\n", "\nx\n"), base.replace("\nb\n", "\ny\n")), /conflict/);
  assert.throws(() => mergeDocBlocks(base, base.replace("| A |", "| X |"), base.replace("| B |", "| Y |")), /conflict/);
  assert.equal(mergeDocBlocks(base, base.replace("Tail", "New tail"), base.replace("| A |", "| X |")), base.replace("Tail", "New tail").replace("| A |", "| X |"));
});

test("a sparse change in a long document maps to just the updated paragraph", () => {
  const base = Array.from({ length: 10_000 }, (_, i) => `paragraph ${i}\n`);
  const local = [...base]; local[124] = "local\n"; local[9900] = "another\n";
  assert.deepEqual(docChanges(base, local), [
    { start: 124, end: 125, replacement: ["local\n"] },
    { start: 9900, end: 9901, replacement: ["another\n"] },
  ]);
});


test("after a lost acknowledgment only later unpublished paragraph edits remain pending", () => {
  const base = "Remote old\n\n* Parent\n\nLocal old\n";
  const local = base.replace("* Parent\n", "* Parent  \n  - Child  \n").replace("Local old", "Local new");
  const remote = base.replace("* Parent\n", "* Parent  \n  * Child\n").replace("Remote old", "Remote new");
  assert.equal(mergeDocBlocks(base, local, remote, nativeDocMarkdownEqual), remote.replace("Local old", "Local new"));
});

test("known block conflicts identify local Markdown lines after earlier insertions, without echoing content", () => {
  const base = "Intro\nHeading\nSecret paragraph\n\n```\nsecret rows\n```\nTail\n";
  const local = base.replace("Heading", "Inserted\nMore inserted\nHeading");
  for (const [old, changed, expected] of [
    ["Secret paragraph", "Private edit", "Local Markdown line 5."],
    ["secret rows", "another\nprivate value", "Local Markdown lines 7-10."],
  ]) {
    assert.throws(() => mergeDocBlocks(base, local.replace(old, changed), base.replace(old, "Online change")), err => {
      assert.ok(err.message.includes(expected)); assert.doesNotMatch(err.message, /secret|private|online change/i); return true;
    });
  }
  const code = "Intro\n```\n" + "x\n".repeat(12) + "```\n";
  assert.throws(() => mergeDocBlocks(code, code.replace("x", "local"), code.replace("x", "web")), /Local Markdown line 2 \(start of block\)/);
  for (const [base, local, remote] of [
    ["A\nA\n", "Local\nA\n", "Web\nA\n"],
    ["A\nA", "Local\nA", "Web\nA"],
    ["A\nOld\nLocal\n", "A\nLocal\nLocal\n", "A\nWeb\nLocal\n"],
    ["A\nOld\n", "A\n", "A\nWeb\n"],
  ]) assert.throws(() => mergeDocBlocks(base, local, remote), err => {
    assert.match(err.message, /changed remotely and locally/); assert.doesNotMatch(err.message, /Markdown lines? \d/); return true;
  });
});

test("a single deleted duplicate is identifiable by two unique unchanged neighbors", () => {
  const base = "Budget\nPending\nOwner\nPending\nTimeline\nFriday\n";
  const deleted = base.replace("Budget\nPending", "Budget");
  for (const [old, replacement] of [["Friday", "Monday"], ["Owner\nPending", "Owner\nResolved"]]) {
    const web=base.replace(old,replacement);
    for (const [a,b] of [[deleted,web],[web,deleted]]) assert.equal(mergeDocBlocks(base,a,b),deleted.replace(old,replacement));
  }
  for (const other of [base.replace("Budget","Scope"),base.replace("Budget\nPending","Budget\nResolved"),
      base.replace("Timeline\nFriday","Friday\nTimeline")]) {
    assert.throws(()=>mergeDocBlocks(base,deleted,other),/conflict/);
  }
});
