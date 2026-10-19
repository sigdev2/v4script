// Timers: the run ends at once, the program goes on in setTimeout and
// setInterval; the page shows "Finished" when no timer is left.
let count = 0;
const id = setInterval(() => {
    count++;
    console.log('tick', count, new Date().toLocaleTimeString());
    if (count === 5) {
        clearInterval(id);
        setTimeout(() => console.log('done'), 500);
    }
}, 400);
console.log('The run ends here, the timers go on.');
