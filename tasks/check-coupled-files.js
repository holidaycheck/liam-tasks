const R = require('ramda');
const Cancel = Symbol('Cancel');

function ignoreCancellations(err) {
    return err === Cancel ? null : Promise.reject(err);
}

function validateAction(payload) {
    return payload.action === 'opened' ? payload : Promise.reject(Cancel);
}

function getPullRequestFileChanges(githubClient, githubParams) {
    const extractFilenames = R.pipe(R.prop('data'), R.map(R.prop('filename')));

    return githubClient.pullRequests.getFiles(githubParams)
        .then(extractFilenames);
}

function detectMissingFiles(fileSets, pullRequestFileChanges) {
    return fileSets.map((fileSet) => {
        return {
            fileSet,
            missingFileChanges: R.without(pullRequestFileChanges, fileSet)
        };
    });
}

function postComment(githubClient, githubParams, missingFiles) {
    const buildFileSetMessageBulletPoint = (missingFilesPair) => {
        const fileSetsList = `\`[${ missingFilesPair.fileSet.join(', ') }]\``;
        const missingFiles = `\`[${ missingFilesPair.missingFileChanges.join(', ') }]\``;

        return `* in ${fileSetsList} set there no change in these files: ${missingFiles}\n`;
    };

    const body = `Usually these filesets are changed together, but I detected some missing changes:\n\n${
        missingFiles.map(buildFileSetMessageBulletPoint).join('')
    }\nPlease make sure that you didn't forget about something. If everything is all right, then sorry, my bad!`;

    return githubClient.issues.createComment(R.merge(githubParams, { body }));
}

function logMessage(logger, githubParams) {
    logger.log(`Posted info under pull request ${githubParams.owner}/${githubParams.repo}#${githubParams.number}`);
}

module.exports = function checkCoupledFiles(logger, { githubClient, fileSets }, payload) {
    const githubParams = {
        number: payload.number,
        owner: payload.repository.owner.login,
        repo: payload.repository.name
    };

    return Promise.resolve(payload)
        .then(validateAction)
        .then(getPullRequestFileChanges.bind(null, githubClient, githubParams))
        .then(detectMissingFiles.bind(null, fileSets))
        .then(postComment.bind(null, githubClient, githubParams))
        .then(logMessage.bind(null, logger, githubParams))
        .catch(ignoreCancellations);
};
