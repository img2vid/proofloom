export const SAMPLE_TEXT=`Some mornings begin with a list. Others begin with a moment worth noticing.

I recieved a letter from an old friend last week. She have spent the winter in a quiet village, collecting stories from the people who live there. “The best stories,” she wrote, “are the the ones we nearly miss.”

Her words reminded me that its important to slow down. In order to see something clearly, we sometimes need to step back. A unexpected detail can change the way we understand an entire day.

I kept her letter on my desk. The paper was worn, the ink a little faded,but the feeling was unmistakable. It was a reminder to look for the small things: a conversation, a familiar street, the ﬁrst light through a window.

Good writing begins in much the same way. We notice. We listen. We make a little room for what comes next.`;

export const OCR_SAMPLE=`The pleasure of reading

There is a quiet satisfaction in returning to an old b00k. Its pages carry the marks of earlier readers, and its words connect us to another tirne.

The ﬁrst task of a careful reader is to look closely. A docu-\nment may contain a broken line, an unfamiliar mark, or a letter that was misread by a machine.

The words dont need to be perfect to be worth saving. But a little care can make them easier to understand,and easier to share.`;

export const EXAMPLE_PLUGIN={
  apiVersion:1,id:'studio.plain-language',name:'Plain language essentials',version:'1.0.0',language:'en',license:'MIT',direction:'ltr',description:'Five small edits that make formal writing easier to read.',
  rules:[
    {id:'present-time',find:'at the present time',replace:'now',category:'style',message:'A shorter phrase can make the sentence feel more direct.',confidence:.9},
    {id:'nearby',find:'in close proximity to',replace:'near',category:'style',message:'Try a simpler expression.',confidence:.9},
    {id:'help',find:'provide assistance to',replace:'help',category:'style',message:'Use a clear, familiar verb.',confidence:.9},
    {id:'start',find:'commence',replace:'start',category:'style',message:'A more familiar word may suit your reader.',confidence:.85},
    {id:'need',find:'is in need of',replace:'needs',category:'style',message:'Consider the shorter verb form.',confidence:.85}
  ],words:[],kind:'plugin',enabled:true
};
