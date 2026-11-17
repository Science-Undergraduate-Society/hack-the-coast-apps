/**
 * Hack the Coast: adds a "Hack the Coast → Release decisions" menu to the
 * applications Sheet.
 *
 * This file is not part of the Next.js app. Paste it into the Sheet's
 * Extensions → Apps Script editor. Setup steps are in the README under
 * "Organizer decisions".
 *
 * Needs two Script properties (Apps Script → Project Settings → Script
 * properties):
 *   RELEASE_URL     https://<deployed site>/api/sheets/release-decisions
 *   RELEASE_SECRET  the same value as SHEETS_RELEASE_SECRET in the app
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Hack the Coast')
    .addItem('Release decisions', 'releaseDecisions')
    .addToUi();
}

function releaseDecisions() {
  const ui = SpreadsheetApp.getUi();

  const answer = ui.alert(
    'Release decisions?',
    'Every applicant with a Decision that has not been released yet will ' +
      'see it in the portal. Accepted applicants cannot be changed back. ' +
      'Continue?',
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) return;

  const properties = PropertiesService.getScriptProperties();
  const url = properties.getProperty('RELEASE_URL');
  const secret = properties.getProperty('RELEASE_SECRET');

  if (!url || !secret) {
    ui.alert(
      'Not set up yet',
      'Ask the dev team to add RELEASE_URL and RELEASE_SECRET in ' +
        'Extensions → Apps Script → Project Settings → Script properties.',
      ui.ButtonSet.OK
    );
    return;
  }

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: { Authorization: 'Bearer ' + secret },
    muteHttpExceptions: true,
  });

  let body = {};
  try {
    body = JSON.parse(response.getContentText());
  } catch (error) {
    // Not JSON. Handled below.
  }

  if (response.getResponseCode() !== 200) {
    ui.alert(
      'Release failed',
      (body.error || 'The server responded with ' + response.getResponseCode()) +
        '. Some decisions may not have been released. It is safe to try ' +
        'again. If it keeps failing, contact the dev team.',
      ui.ButtonSet.OK
    );
    return;
  }

  let message = body.released + ' decision(s) released.';
  if (body.problems && body.problems.length) {
    message += '\n\nNeeds attention:\n' + body.problems.join('\n');
  }

  ui.alert('Done', message, ui.ButtonSet.OK);
}
