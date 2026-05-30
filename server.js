import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import catalogoRoutes from './src/api/catalogoRoutes.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/catalogo', catalogoRoutes);

app.get('/', (req, res) => res.json({ ok: true, message: 'SGC API' }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
