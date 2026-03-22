import app from "./app.js";
import { getDb } from "./db/connection.js";

const port = process.env.PORT ?? 3000;

// Fail fast if DATABASE_URL is missing or DB is unreachable
getDb();

app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
});
