import sys
sys.path.append("/Volumes/SSD MAC  MINI 2025/Applications/Antigravity/Sea Distances/Eurostat -sea routes/searoute-1.4.3")
from searoute import ports
nodes = list(ports.nodes(data=True))
print("Total ports:", len(nodes))
for i in range(5):
    print(nodes[i])
