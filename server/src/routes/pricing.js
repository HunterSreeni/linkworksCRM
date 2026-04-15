import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

// GET /api/pricing - List pricing rules
router.get('/', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('pricing_rules')
      .select('*')
      .order('vehicle_type', { ascending: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ rules: data });
  } catch (err) {
    console.error('List pricing rules error:', err);
    return res.status(500).json({ error: 'Failed to list pricing rules' });
  }
});

// GET /api/pricing/calculate - Calculate price for given vehicle_type + hazardous + optional weight
router.get('/calculate', authenticate, async (req, res) => {
  try {
    const { vehicle_type, hazardous, weight_kg } = req.query;

    if (!vehicle_type) {
      return res.status(400).json({ error: 'vehicle_type is required' });
    }

    const isHazardous = hazardous === 'true' || hazardous === '1';
    const weight = weight_kg ? parseFloat(weight_kg) : 0;

    // Find matching pricing rule - schema has UNIQUE(vehicle_type, is_hazardous)
    // so there's a distinct row per hazard flag.
    const { data: rule, error } = await supabaseAdmin
      .from('pricing_rules')
      .select('*')
      .eq('vehicle_type', vehicle_type)
      .eq('is_hazardous', isHazardous)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!rule) {
      return res.status(404).json({
        error: `No active pricing rule for vehicle_type=${vehicle_type}, hazardous=${isHazardous}`,
      });
    }

    const basePrice = parseFloat(rule.base_price) || 0;
    const perKg = parseFloat(rule.price_per_kg) || 0;
    const weightCharge = weight > 0 ? weight * perKg : 0;
    const total = basePrice + weightCharge;

    return res.json({
      vehicle_type,
      hazardous: isHazardous,
      weight_kg: weight,
      base_price: basePrice,
      price_per_kg: perKg,
      weight_charge: weightCharge,
      total_price: total,
    });
  } catch (err) {
    console.error('Calculate pricing error:', err);
    return res.status(500).json({ error: 'Failed to calculate price' });
  }
});

// POST /api/pricing - Create pricing rule (admin only)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { vehicle_type, is_hazardous = false, base_price, price_per_kg = 0, description, is_active = true } = req.body;

    if (!vehicle_type || base_price === undefined) {
      return res.status(400).json({ error: 'vehicle_type and base_price are required' });
    }

    const newRule = {
      id: uuidv4(),
      vehicle_type,
      is_hazardous,
      base_price,
      price_per_kg,
      description: description || null,
      is_active,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('pricing_rules')
      .insert(newRule)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(201).json({ rule: data });
  } catch (err) {
    console.error('Create pricing rule error:', err);
    return res.status(500).json({ error: 'Failed to create pricing rule' });
  }
});

// PUT /api/pricing/:id - Update pricing rule (admin only)
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { vehicle_type, is_hazardous, base_price, price_per_kg, description, is_active } = req.body;

    const updates = { updated_at: new Date().toISOString() };
    if (vehicle_type !== undefined) updates.vehicle_type = vehicle_type;
    if (is_hazardous !== undefined) updates.is_hazardous = is_hazardous;
    if (base_price !== undefined) updates.base_price = base_price;
    if (price_per_kg !== undefined) updates.price_per_kg = price_per_kg;
    if (description !== undefined) updates.description = description;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data, error } = await supabaseAdmin
      .from('pricing_rules')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: 'Pricing rule not found' });
    }

    return res.json({ rule: data });
  } catch (err) {
    console.error('Update pricing rule error:', err);
    return res.status(500).json({ error: 'Failed to update pricing rule' });
  }
});

export default router;
