import express from 'express';
import connectDB from './db';
import cors from 'cors';

const app = express();
app.use(express.json({ limit: '16kb' })); // Adjust the limit as needed
app.use(express.urlencoded({ extended: true, limit: '16kb' })); // Adjust the limit as needed 
app.use(express.static('public')); // Serve static files from the 'public' directory

app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true
}))


connectDB()
    .then(() => {
        app.listen(process.env.PORT, () => {
            console.log(`Server is running on port ${process.env.PORT}`);
        });
    })
    .catch((error) => {
        console.error('Failed to connect to the database:', error);
    }); 
