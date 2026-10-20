// Old clients must refresh rather than writing a separate like state.
function retired() {
  return Response.json({ error: "Likes have been replaced by voting. Please refresh the feed." }, { status: 410 });
}
export const PUT = retired;
export const DELETE = retired;
