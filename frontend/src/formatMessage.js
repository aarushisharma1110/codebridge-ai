export function formatMessage(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key])
}
