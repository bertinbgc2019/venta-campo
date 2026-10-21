const disc = await (await fetch("https://firebaserules.googleapis.com/$discovery/rest?version=v1")).json();
for (const s of ["TestCase","TestSuite","TestCaseRequest","TestCaseContext","TestCaseExpected","TestCaseQuery"]) {
  if (disc.schemas[s]) { console.log("=== " + s + " ==="); console.log(JSON.stringify(disc.schemas[s], null, 2)); }
}
console.log("=== metodo test ===");
console.log(JSON.stringify(disc.resources.projects.methods.test, null, 2));
