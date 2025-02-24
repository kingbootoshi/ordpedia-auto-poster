general to do
- make it so new pages that are approved are saved to public github
-> save all existing pages to github 

- set up a cloud memory equivalent ordpedia memory pipeline that takes entire pages, extracts facts from it, and becomes queryable

(is extracted facts reliable here, or chunking sentences into facts? do testing)

- turn ordpedia server into an API that developers can hit which the cloud memory query will return the most relevant data

- add revision updates later, but if a page gets revised, we should probably delete old facts then re-run the pipeline. which means that we need to save memory IDs for each page and then we can delete old facts by memory ID.