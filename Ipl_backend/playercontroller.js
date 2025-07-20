import { Router } from 'express';
import xlsx from 'xlsx';
import mongoose from 'mongoose';
import path from 'path';

const router = Router();

// Use forward slashes or path.join for better cross-platform compatibility
const EXCEL_FILE_PATH = "C:/Users/REDDY/Desktop/ipl_players_list_updated_links.xlsx"; 

router.post('/import-local-players', async (req, res) => {
  try {
    // 1. Read the Excel file from local storage
    const workbook = xlsx.readFile(EXCEL_FILE_PATH);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const playersData = xlsx.utils.sheet_to_json(worksheet);

    // 2. Transform data to match your schema
    const players = playersData.map(row => {
        // Combine First Name and Surname columns if present
        const firstName = row['First Name'] || row['first name'] || '';
        const surname = row['Surname'] || row['surname'] || '';
        const name = (firstName + ' ' + surname).trim() || row['name'] || row['Name'] || '';

        return {
          
            name,
            playerId: row['List Sr.No.'],
            country: row['Country'] || row['country'] || '',
            age: Number(row['Age'] || row['age'] || 0),
            specialism: row['Specialism'] || row['specialism'] || '',
            category: row['Category'] || row['category'] || '',
            previousiplTeams: row['Previous IPL Teams'] ? 
                String(row['Previous IPL Teams']).split(',').map(t => t.trim()) : [],
            base: row['Base'] || row['base'] || '',
            image: row['Image'] || row['image'] || '',
            soldprice: Number(row['Sold Price'] || row['soldprice'] || 0),
            status: ['sold', 'unsold',''].includes(String(row['Status'] || row['status']).toLowerCase()) 
                ? String(row['Status'] || row['status']).toLowerCase()
                : 'unsold',
            franchise: row['Franchise'] || row['franchise'] || 'Unknown'
        };
    });

    // 3. Clear existing data and insert new records
    await mongoose.connection.dropCollection('players').catch(() => {});
    await mongoose.connection.createCollection('players');
    await mongoose.model('Player').insertMany(players);

    res.status(200).json({
      success: true,
      message: `Successfully imported ${players.length} players`,
      data: players
    });

  } catch (error) {
    console.error('Import failed:', error);
    res.status(500).json({
      success: false,
      message: 'Player import failed',
      error: error.message
    });
  }
});

export default router;