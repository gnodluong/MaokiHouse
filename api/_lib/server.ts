import dotenv from 'dotenv';
dotenv.config();

import app from './app';

const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;

app.listen(PORT, () => {
  console.log(`Maoki House API listening on port ${PORT}`);
});
