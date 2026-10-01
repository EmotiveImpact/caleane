export function questionIsVisible(question,answers){
 if(question.screenExcluded===true)return false;
 const condition=question.showWhen;
 return !condition||answers?.[condition.questionId]===condition.equals;
}
