function setPins() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty("PIN_JEFATURA", "1234"); // ← elegí el PIN que quieras
  props.setProperty("PIN_ADMIN",    "5678"); // ← elegí el PIN que quieras
}

function verPins() {
  const props = PropertiesService.getScriptProperties();
  console.log("JEFATURA:", props.getProperty("PIN_JEFATURA"));
  console.log("ADMIN:", props.getProperty("PIN_ADMIN"));
}