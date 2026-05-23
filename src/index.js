import connectDB from "./db/index.js";
import { initCronJobs } from "./services/cron/cron.service.js";
import app from "./app.js";

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    initCronJobs();
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to connect to the database:", error);
    process.exit(1);
  });
