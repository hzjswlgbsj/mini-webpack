export default function jsonLoader(source) {
  return `export default ${JSON.stringify(source)}`;
}
