type
  PNode = ^TNode;
  TNode = record
    Value: Integer;
    Next: PNode;
  end;

var head: PNode;
begin
  New(head);
  head^.Value := 1;
  head^.Next := nil;
  WriteLn(head^.Value);
  WriteLn(head^.Next^.Value);
end.

// Output:
// 1
// Error: Access violation
// Line: 14
