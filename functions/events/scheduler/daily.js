const lib = require('lib')({token: process.env.STDLIB_SECRET_TOKEN});
/**
* An HTTP endpoint that acts as a webhook for Scheduler daily event
* @returns {object} result The result of your workflow steps
*/
module.exports = async () => {

  // Prepare workflow object to store API responses

  let result = {
    agencies: [],
    emails: []
  };

  // First, retrieve all subscribed agencies with an active balance

  console.log(`Running googlesheets.query[@0.2.1].select()...`);

  let agencyQueryResult = await lib.googlesheets.query['@0.2.1'].select({
    range: `Subscribed Agencies!A1:Z10000`,
    bounds: 'FIRST_EMPTY_ROW',
    where: [
      {
        'Balance__gt': 0
      }
    ],
    limit: {
      'count': 0,
      'offset': 0
    }
  });
  
  let agencies = agencyQueryResult.rows;
  
  for (let i = 0; i < agencies.length; i++) {
    
    // Go over each agency...
    
    let agency = agencies[i];
    
    console.log(`Running googlesheets.query[@0.2.1].select()...`);
    
    // Look for leads that aren't in the "Sent Lead IDs" field
  
    let leadsQueryResult = await lib.googlesheets.query['@0.2.1'].select({
      range: `Qualified Leads for Agencies!A1:Z10000`,
      bounds: 'FIRST_EMPTY_ROW',
      where: [
        {
          'Lead ID__not_in': agency.fields['Sent Lead IDs'].split(',')
        }
      ],
      limit: {
        'count': parseInt(agency.fields['Balance']) || 0,
        'offset': 0
      }
    });
    
    let leads = leadsQueryResult.rows;
    
    // Only send an e-mail if there are leads found
    
    if (leads.length) {
      
      // Update the agency information
    
      agency.fields['Sent Lead IDs'] =
        agency.fields['Sent Lead IDs']
          .split(',')
          .concat(leads.map(lead => lead.fields['Lead ID']))
          .filter(v => !!v)
          .join(',');
      agency.fields['Balance'] = (parseInt(agency.fields['Balance']) || 0) - leads.length;
      agency.fields['Sent'] = (parseInt(agency.fields['Sent']) || 0) + leads.length;
            
      // Set the e-mail information: `body` is the E-mail body
      
      let recipientEmail = agency.fields['Email'];
      let dateString = new Date().toISOString();
      let subject = `Awesome! ${leads.length} New Leads for ${dateString}`;
      let body = `Here are your new leads!\n\n` +
        leads.map(lead => {
          return [
            `ID: ${lead.fields['Lead ID']}`,
            `Phone: ${lead.fields['Phone']}`,
            `Email: ${lead.fields['Email']}`
          ].join('\n')
        }).join('\n\n');
        
      // Send the E-mail. OPTIONAL: can set `html` instead of `text`
    
      console.log(`Running gmail.messages[@0.1.6].create()...`);

      let gmailMessage = await lib.gmail.messages['@0.1.6'].create({
        to: recipientEmail,
        subject: subject,
        cc: null,
        bcc: null,
        text: body,
        html: null
      });
      
      // Update the `Sent Emails` sheet
      
      let insertEmailQueryResult = await lib.googlesheets.query['@0.2.1'].insert({
        range: `Sent Emails!A1:Z10000`,
        bounds: 'FIRST_EMPTY_ROW',
        fields: {
          'Recipient': recipientEmail,
          'Date & Time': dateString,
          'Subject': subject
        }
      });
      
      // Save the results
  
      result.agencies.push(agency);
      result.emails.push(gmailMessage);
      
    }
    
  }
  
  // Update the `Subscribed Agencies` sheet with the agencies that have had leads sent to them
  
  console.log(`Running googlesheets.query[@0.2.1].replace()...`);
  
  let updateAgenciesQueryResult = await lib.googlesheets.query['@0.2.1'].replace({
    range: `Subscribed Agencies!A1:Z10000`,
    bounds: 'FIRST_EMPTY_ROW',
    replaceRows: result.agencies
  });

  return result;
  
};