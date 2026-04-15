import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    
    // Si viene de una automatización
    let cleaner_id = body.cleaner_id;
    let month_period = body.month_period;
    let entity_name = body.event?.entity_name;
    let entity_data = body.data;
    
    // Extraer cleaner_id y month_period según el tipo de entidad
    if (!cleaner_id || !month_period) {
      if (entity_data) {
        cleaner_id = entity_data.cleaner_id;
        month_period = entity_data.month_period;
        
        // Para VehicleChecklistRecord, obtener el team_member_ids
        if (entity_name === 'VehicleChecklistRecord' && entity_data.team_member_ids) {
          // Recalcular para cada miembro del equipo
          for (const memberId of entity_data.team_member_ids) {
            await recalculateForCleaner(base44, memberId, month_period);
          }
          return Response.json({ success: true, message: 'Scores updated for team members' });
        }
      }
    }

    if (!cleaner_id || !month_period) {
      return Response.json({ error: 'Missing required fields: cleaner_id and month_period' }, { status: 400 });
    }
    
    await recalculateForCleaner(base44, cleaner_id, month_period);
    return Response.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function recalculateForCleaner(base44, cleaner_id, month_period) {

    // Get monthly score record
    const monthlyScores = await base44.entities.MonthlyCleanerScore.filter({
      cleaner_id,
      month_period
    });

    if (monthlyScores.length === 0) {
      return Response.json({ error: 'Monthly score not found' }, { status: 404 });
    }

    const monthlyScore = monthlyScores[0];

    // Get all reviews for this cleaner this month
    const performanceReviews = await base44.entities.PerformanceReview.filter({
      cleaner_id,
      month_period
    });

    const punctualityRecords = await base44.entities.PunctualityRecord.filter({
      cleaner_id,
      month_period
    });

    const vehicleChecks = await base44.entities.VehicleChecklistRecord.filter({
      month_period
    });

    const clientFeedback = await base44.entities.ClientFeedback.filter({
      month_period
    });

    // Calculate Performance average
    let performanceScore = 0;
    if (performanceReviews.length > 0) {
      const total = performanceReviews.reduce((sum, review) => sum + (review.overall_score || 0), 0);
      performanceScore = total / performanceReviews.length;
    }

    // Calculate Punctuality average (scale 0-100 based on tardiness and attendance)
    let punctualityScore = 0;
    if (punctualityRecords.length > 0) {
      let totalScore = 0;
      punctualityRecords.forEach(record => {
        let score = 100; // Start with 100
        
        // Deduct for tardiness (1 point per minute late, max -30)
        if (record.minutes_late > 0) {
          score -= Math.min(record.minutes_late, 30);
        }
        
        // Deduct for uniform issues
        if (record.uniform_ok === false) score -= 10;
        
        // Deduct for presentation issues
        if (record.presentation_ok === false) score -= 5;
        
        // Deduct for absence
        if (record.absence === true) score = 0;
        
        totalScore += Math.max(score, 0);
      });
      punctualityScore = totalScore / punctualityRecords.length;
    }

    // Calculate Vehicle average (deductions per member)
    let vehicleScore = 0;
    const vehicleChecksForTeam = vehicleChecks.filter(v => 
      v.team_member_ids && v.team_member_ids.includes(cleaner_id)
    );
    
    if (vehicleChecksForTeam.length > 0) {
      let totalScore = 0;
      vehicleChecksForTeam.forEach(check => {
        let score = 100;
        score -= (check.points_per_member || 0);
        totalScore += Math.max(score, 0);
      });
      vehicleScore = totalScore / vehicleChecksForTeam.length;
    }

    // Calculate Feedback average
    let feedbackScore = 0;
    const cleanerFeedback = clientFeedback.filter(f =>
      f.affected_cleaner_ids && f.affected_cleaner_ids.includes(cleaner_id)
    );
    
    if (cleanerFeedback.length > 0) {
      let totalScore = 0;
      cleanerFeedback.forEach(feedback => {
        let score = 100;
        
        if (feedback.feedback_type === 'complaint') {
          // Deduct based on severity
          if (feedback.severity === 'high') score -= 20;
          else if (feedback.severity === 'medium') score -= 10;
          else score -= 5;
        } else if (feedback.feedback_type === 'compliment') {
          // Add bonus
          score += 10;
        }
        
        totalScore += Math.max(score, 0);
      });
      feedbackScore = totalScore / cleanerFeedback.length;
    }

    // Calculate overall current_score as average of 4 components
    const currentScore = (performanceScore + punctualityScore + vehicleScore + feedbackScore) / 4;

    // Update monthly score
    await base44.entities.MonthlyCleanerScore.update(monthlyScore.id, {
      performance_score: Math.round(performanceScore * 100) / 100,
      punctuality_score: Math.round(punctualityScore * 100) / 100,
      vehicle_score: Math.round(vehicleScore * 100) / 100,
      feedback_score: Math.round(feedbackScore * 100) / 100,
      current_score: Math.round(currentScore * 100) / 100,
      performance_count: performanceReviews.length,
      punctuality_count: punctualityRecords.length,
      vehicle_count: vehicleChecksForTeam.length,
      feedback_count: cleanerFeedback.length
    });
}