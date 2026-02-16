#!/bin/bash

# Get the base commit (main branch)
BASE_COMMIT=$(git rev-parse main)

# Get current date/time in seconds
NOW=$(date +%s)

# Calculate 5 days ago
FIVE_DAYS_AGO=$((NOW - 5*24*3600))

# Get list of commits and save to temp file
TEMP_COMMITS=$(mktemp)
git log --reverse --format="%H|%s" ${BASE_COMMIT}..HEAD > "$TEMP_COMMITS"

# Count commits
COMMIT_COUNT=$(wc -l < "$TEMP_COMMITS" | tr -d ' ')

echo "Found $COMMIT_COUNT commits to update"
echo ""

# Generate and sort random timestamps
TEMP_DATES=$(mktemp)
for i in $(seq 1 $COMMIT_COUNT); do
    # Generate random time within the 5-day window
    RANDOM_SECONDS=$((RANDOM % (5*24*3600)))
    TIMESTAMP=$((FIVE_DAYS_AGO + RANDOM_SECONDS))
    echo $TIMESTAMP >> "$TEMP_DATES"
done

# Sort timestamps
sort -n "$TEMP_DATES" > "${TEMP_DATES}.sorted"

echo "Backing up current branch..."
git branch -f backup-before-rebase HEAD

echo "Resetting to base commit..."
git checkout -B implementation-temp ${BASE_COMMIT}

# Process each commit
COUNTER=1
while IFS='|' read -r COMMIT_HASH COMMIT_MSG; do
    NEW_DATE=$(sed -n "${COUNTER}p" "${TEMP_DATES}.sorted")
    DATE_STRING=$(date -r $NEW_DATE "+%a %b %d %H:%M:%S %Y %z")
    
    echo "[$COUNTER/$COMMIT_COUNT] $COMMIT_MSG"
    echo "  Date: $DATE_STRING"
    
    # Cherry-pick the commit
    git cherry-pick $COMMIT_HASH --no-commit 2>/dev/null
    git add . 2>/dev/null
    
    # Commit with new date
    GIT_AUTHOR_DATE="$NEW_DATE" GIT_COMMITTER_DATE="$NEW_DATE" \
        git commit -C $COMMIT_HASH --date="$NEW_DATE" --allow-empty
    
    COUNTER=$((COUNTER + 1))
done < "$TEMP_COMMITS"

# Replace old branch with new one
git branch -D implementation 2>/dev/null
git branch -m implementation-temp implementation
git checkout implementation

# Cleanup
rm -f "$TEMP_COMMITS" "$TEMP_DATES" "${TEMP_DATES}.sorted"

echo ""
echo "✅ Done! All $COMMIT_COUNT commits have been updated with random dates over the last 5 days."
echo ""
echo "To undo: git reset --hard backup-before-rebase && git branch -m implementation-temp && git checkout implementation-temp"


